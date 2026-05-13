import { and, eq, inArray } from "drizzle-orm";
import { Cause, Data, DateTime, Effect } from "effect";
import type {
  MediaRecord,
  MemberRecord,
  MemberSyncSink,
  OfficeRecord,
  OfficeSyncSink,
  OpenHouseRecord,
  OpenHouseSyncSink,
  PropertyGraph,
  PropertyRecord,
  PropertySyncSink,
  RoomRecord,
  SyncOwner,
  SyncRecordError,
} from "../sync";
import type { Destination } from "../schema/destinationSchema";
import type { SocialMedia } from "../schema/officeSchema";
import { DdfDatabase } from "./layer";
import type { DdfSerializedCause } from "./schema";
import {
  ddfDestinations,
  ddfMedia,
  ddfMemberDesignations,
  ddfMemberLanguages,
  ddfMembers,
  ddfOffices,
  ddfOpenHouses,
  ddfProperties,
  ddfPropertyRooms,
  ddfSocialMedia,
  ddfSyncErrors,
  touchUpdatedAt,
} from "./schema";

export class DdfDatabaseSinkError extends Data.TaggedError(
  "DdfDatabaseSinkError",
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF database sink operation failed: ${this.operation}`;
  }
}

type JsonRecord = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : {};

const arbitraryStringField = (record: JsonRecord, field: string): string | null => {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const nullable = <Value>(value: Value | null | undefined): Value | null =>
  value ?? null;

const stableKey = (value: string | null | undefined): string | null =>
  value != null && value.length > 0 ? value : null;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const stableHash = (value: unknown): string => {
  let hash = 0x811c9dc5;
  const text = stableJson(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const primaryMediaUrl = (media: ReadonlyArray<MediaRecord> | null | undefined): string | null =>
  media?.find((record) => stableKey(record.MediaURL) !== null)?.MediaURL ?? null;

const fallbackKey = (
  scope: string,
  parts: ReadonlyArray<string | number | null | undefined>,
  raw: unknown,
): string =>
  [...parts.filter((part): part is string | number => part != null), stableHash(raw)]
    .join(":") || `${scope}:${stableHash(raw)}`;

const dateValue = (value: Date | DateTime.DateTime | string | null | undefined): string | null => {
  const iso = value instanceof Date
    ? value.toISOString()
    : DateTime.isDateTime(value)
      ? DateTime.formatIso(value)
      : typeof value === "string"
        ? value
        : null;
  return iso === null ? null : iso.slice(0, 10);
};

const timeValue = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const match = /^(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(value);
  return match?.[1] ?? null;
};

const timestampValue = (value: Date | DateTime.DateTime | string | null | undefined): Date | null => {
  if (value == null) return null;
  if (value instanceof Date) return value;

  const millis = Date.parse(
    DateTime.isDateTime(value) ? DateTime.formatIso(value) : value,
  );
  return Number.isFinite(millis) ? new Date(millis) : null;
};

const requireKey = (operation: string, key: string | null) =>
  key === null || key.length === 0
    ? Effect.fail(
        new DdfDatabaseSinkError({
          operation,
          cause: new Error(`Missing stable key for ${operation}`),
        }),
      )
    : Effect.succeed(key);

const requireNumberKey = (operation: string, key: number | null) =>
  key === null
    ? Effect.fail(
        new DdfDatabaseSinkError({
          operation,
          cause: new Error(`Missing stable key for ${operation}`),
        }),
      )
    : Effect.succeed(key);

export const propertyRowFromRecord = (property: PropertyRecord) => ({
  listingKey: stableKey(property.ListingKey),
  listingId: nullable(property.ListingId),
  modificationTimestamp: timestampValue(property.ModificationTimestamp),
  originalEntryTimestamp: timestampValue(property.OriginalEntryTimestamp),
  availabilityDate: dateValue(property.AvailabilityDate),
  statusChangeTimestamp: timestampValue(property.StatusChangeTimestamp),
  photosChangeTimestamp: timestampValue(property.PhotosChangeTimestamp),
  standardStatus: nullable(property.StandardStatus),
  propertySubType: nullable(property.PropertySubType),
  businessType: nullable(property.BusinessType),
  publicRemarks: nullable(property.PublicRemarks),
  listPrice: nullable(property.ListPrice),
  leaseAmount: nullable(property.LeaseAmount),
  leaseAmountFrequency: nullable(property.LeaseAmountFrequency),
  leasePerUnit: nullable(property.LeasePerUnit),
  pricePerUnit: nullable(property.PricePerUnit),
  associationFee: nullable(property.AssociationFee),
  associationFeeFrequency: nullable(property.AssociationFeeFrequency),
  associationName: nullable(property.AssociationName),
  associationFeeIncludes: nullable(property.AssociationFeeIncludes),
  totalActualRent: nullable(property.TotalActualRent),
  existingLeaseType: nullable(property.ExistingLeaseType),
  listOfficeKey: nullable(property.ListOfficeKey),
  coListOfficeKey: nullable(property.CoListOfficeKey),
  coListOfficeKey2: nullable(property.CoListOfficeKey2),
  coListOfficeKey3: nullable(property.CoListOfficeKey3),
  listOfficeNationalAssociationId: nullable(property.ListOfficeNationalAssociationId),
  coListOfficeNationalAssociationId: nullable(property.CoListOfficeNationalAssociationId),
  coListOfficeNationalAssociationId2: nullable(property.CoListOfficeNationalAssociationId2),
  coListOfficeNationalAssociationId3: nullable(property.CoListOfficeNationalAssociationId3),
  listAgentKey: nullable(property.ListAgentKey),
  coListAgentKey: nullable(property.CoListAgentKey),
  coListAgentKey2: nullable(property.CoListAgentKey2),
  coListAgentKey3: nullable(property.CoListAgentKey3),
  listAgentNationalAssociationId: nullable(property.ListAgentNationalAssociationId),
  coListAgentNationalAssociationId: nullable(property.CoListAgentNationalAssociationId),
  coListAgentNationalAssociationId2: nullable(property.CoListAgentNationalAssociationId2),
  coListAgentNationalAssociationId3: nullable(property.CoListAgentNationalAssociationId3),
  listingUrl: nullable(property.ListingURL),
  originatingSystemName: nullable(property.OriginatingSystemName),
  photosCount: nullable(property.PhotosCount),
  commonInterest: nullable(property.CommonInterest),
  listAor: nullable(property.ListAOR),
  listAorKey: nullable(property.ListAORKey),
  unparsedAddress: nullable(property.UnparsedAddress),
  postalCode: nullable(property.PostalCode),
  subdivisionName: nullable(property.SubdivisionName),
  province: nullable(property.StateOrProvince),
  streetDirPrefix: nullable(property.StreetDirPrefix),
  streetDirSuffix: nullable(property.StreetDirSuffix),
  streetName: nullable(property.StreetName),
  streetNumber: nullable(property.StreetNumber),
  streetSuffix: nullable(property.StreetSuffix),
  unitNumber: nullable(property.UnitNumber),
  country: nullable(property.Country),
  city: nullable(property.City),
  directions: nullable(property.Directions),
  cityRegion: nullable(property.CityRegion),
  latitude: nullable(property.Latitude),
  longitude: nullable(property.Longitude),
  mapCoordinateVerified: nullable(property.MapCoordinateVerifiedYN),
  geocodeManual: nullable(property.GeocodeManualYN),
  parkingTotal: nullable(property.ParkingTotal),
  parkingFeatures: nullable(property.ParkingFeatures),
  yearBuilt: nullable(property.YearBuilt),
  bathroomsPartial: nullable(property.BathroomsPartial),
  bathroomsTotalInteger: nullable(property.BathroomsTotalInteger),
  bedroomsTotal: nullable(property.BedroomsTotal),
  bedroomsAboveGrade: nullable(property.BedroomsAboveGrade),
  bedroomsBelowGrade: nullable(property.BedroomsBelowGrade),
  buildingAreaTotal: nullable(property.BuildingAreaTotal),
  buildingAreaUnits: nullable(property.BuildingAreaUnits),
  buildingFeatures: nullable(property.BuildingFeatures),
  aboveGradeFinishedArea: nullable(property.AboveGradeFinishedArea),
  aboveGradeFinishedAreaUnits: nullable(property.AboveGradeFinishedAreaUnits),
  aboveGradeFinishedAreaSource: nullable(property.AboveGradeFinishedAreaSource),
  aboveGradeFinishedAreaMinimum: nullable(property.AboveGradeFinishedAreaMinimum),
  aboveGradeFinishedAreaMaximum: nullable(property.AboveGradeFinishedAreaMaximum),
  belowGradeFinishedArea: nullable(property.BelowGradeFinishedArea),
  belowGradeFinishedAreaUnits: nullable(property.BelowGradeFinishedAreaUnits),
  belowGradeFinishedAreaSource: nullable(property.BelowGradeFinishedAreaSource),
  belowGradeFinishedAreaMinimum: nullable(property.BelowGradeFinishedAreaMinimum),
  belowGradeFinishedAreaMaximum: nullable(property.BelowGradeFinishedAreaMaximum),
  livingArea: nullable(property.LivingArea),
  livingAreaUnits: nullable(property.LivingAreaUnits),
  livingAreaSource: nullable(property.LivingAreaSource),
  livingAreaMinimum: nullable(property.LivingAreaMinimum),
  livingAreaMaximum: nullable(property.LivingAreaMaximum),
  firePlacesTotal: nullable(property.FireplacesTotal),
  fireplace: nullable(property.FireplaceYN),
  fireplaceFeatures: nullable(property.FireplaceFeatures),
  architecturalStyle: nullable(property.ArchitecturalStyle),
  heating: nullable(property.Heating),
  foundationDetails: nullable(property.FoundationDetails),
  basement: nullable(property.Basement),
  exteriorFeatures: nullable(property.ExteriorFeatures),
  flooring: nullable(property.Flooring),
  cooling: nullable(property.Cooling),
  propertyCondition: nullable(property.PropertyCondition),
  roof: nullable(property.Roof),
  constructionMaterials: nullable(property.ConstructionMaterials),
  stories: nullable(property.Stories),
  propertyAttached: nullable(property.PropertyAttachedYN),
  accessibilityFeatures: nullable(property.AccessibilityFeatures),
  zoning: nullable(property.Zoning),
  zoningDescription: nullable(property.ZoningDescription),
  taxAnnualAmount: nullable(property.TaxAnnualAmount),
  taxBlock: nullable(property.TaxBlock),
  taxLot: nullable(property.TaxLot),
  taxYear: nullable(property.TaxYear),
  structureType: nullable(property.StructureType),
  parcelNumber: nullable(property.ParcelNumber),
  utilities: nullable(property.Utilities),
  irrigationSource: nullable(property.IrrigationSource),
  waterSource: nullable(property.WaterSource),
  sewer: nullable(property.Sewer),
  electric: nullable(property.Electric),
  documentsAvailable: nullable(property.DocumentsAvailable),
  waterBodyName: nullable(property.WaterBodyName),
  view: nullable(property.View),
  numberOfBuildings: nullable(property.NumberOfBuildings),
  numberOfUnitsTotal: nullable(property.NumberOfUnitsTotal),
  lotFeatures: nullable(property.LotFeatures),
  lotSizeArea: nullable(property.LotSizeArea),
  lotSizeDimensions: nullable(property.LotSizeDimensions),
  lotSizeUnits: nullable(property.LotSizeUnits),
  poolFeatures: nullable(property.PoolFeatures),
  roadSurfaceType: nullable(property.RoadSurfaceType),
  currentUse: nullable(property.CurrentUse),
  possibleUse: nullable(property.PossibleUse),
  anchorsCoTenants: nullable(property.AnchorsCoTenants),
  waterfrontFeatures: nullable(property.WaterfrontFeatures),
  communityFeatures: nullable(property.CommunityFeatures),
  frontageLengthNumeric: nullable(property.FrontageLengthNumeric),
  frontageLengthNumericUnits: nullable(property.FrontageLengthNumericUnits),
  fencing: nullable(property.Fencing),
  appliances: nullable(property.Appliances),
  otherEquipment: nullable(property.OtherEquipment),
  securityFeatures: nullable(property.SecurityFeatures),
  inclusions: nullable(property.Inclusions),
  internetEntireListingDisplay: nullable(property.InternetEntireListingDisplayYN),
  internetAddressDisplay: nullable(property.InternetAddressDisplayYN),
  rooms: nullable(property.Rooms),
  media: nullable(property.Media),
  primaryMediaUrl: primaryMediaUrl(property.Media),
  active: true,
  raw: property,
});

export const propertyRowFromGraph = (graph: PropertyGraph) => ({
  ...propertyRowFromRecord(graph.property),
  rooms: graph.rooms,
  media: graph.media,
  primaryMediaUrl: primaryMediaUrl(graph.media),
});

export const roomRowFromRecord = (room: RoomRecord, property: PropertyRecord) => {
  const listingKey = stableKey(room.ListingKey) ?? stableKey(property.ListingKey);
  return {
    listingKey,
    listingId: nullable(room.ListingId) ?? nullable(property.ListingId),
    roomKey:
      stableKey(room.RoomKey) ??
      fallbackKey(
        "room",
        [
          listingKey,
          stableKey(room.RoomType),
          stableKey(room.RoomLevel),
          stableKey(room.RoomDimensions),
        ],
        room,
      ),
    modificationTimestamp: timestampValue(room.ModificationTimestamp),
    roomDescription: nullable(room.RoomDescription),
    roomDimensions: nullable(room.RoomDimensions),
    roomLength: nullable(room.RoomLength),
    roomLevel: nullable(room.RoomLevel),
    roomWidth: nullable(room.RoomWidth),
    roomLengthWidthUnits: nullable(room.RoomLengthWidthUnits),
    roomType: nullable(room.RoomType),
    raw: room,
  };
};

export const mediaRowFromRecord = (media: MediaRecord, owner: SyncOwner) => ({
  mediaKey:
    stableKey(media.MediaKey) ??
    fallbackKey(
      "media",
      [owner.resource, owner.key, stableKey(media.MediaURL), nullable(media.Order)],
      media,
    ),
  resource: owner.resource,
  resourceKey: owner.key,
  resourceRecordId: nullable(media.ResourceRecordId),
  resourceRecordKey: nullable(media.ResourceRecordKey),
  resourceName: nullable(media.ResourceName),
  modificationTimestamp: timestampValue(media.ModificationTimestamp),
  mediaUrl: nullable(media.MediaURL),
  mediaCategory: nullable(media.MediaCategory),
  longDescription: nullable(media.LongDescription),
  preferredPhoto: nullable(media.PreferredPhotoYN),
  sortOrder: nullable(media.Order),
  raw: media,
});

export const memberRowFromRecord = (member: MemberRecord) => ({
  memberKey: stableKey(member.MemberKey),
  memberMlsId: nullable(member.MemberMlsId),
  modificationTimestamp: timestampValue(member.ModificationTimestamp),
  originalEntryTimestamp: timestampValue(member.OriginalEntryTimestamp),
  officeKey: nullable(member.OfficeKey),
  officeNationalAssociationId: nullable(member.OfficeNationalAssociationId),
  jobTitle: nullable(member.JobTitle),
  memberAorKey: nullable(member.MemberAORKey),
  memberAor: nullable(member.MemberAOR),
  address1: nullable(member.MemberAddress1),
  address2: nullable(member.MemberAddress2),
  city: nullable(member.MemberCity),
  province: nullable(member.MemberStateOrProvince),
  country: nullable(member.MemberCountry),
  postalCode: nullable(member.MemberPostalCode),
  fax: nullable(member.MemberFax),
  firstName: nullable(member.MemberFirstName),
  lastName: nullable(member.MemberLastName),
  middleName: nullable(member.MemberMiddleName),
  namePrefix: nullable(member.MemberNamePrefix),
  nameSuffix: nullable(member.MemberNameSuffix),
  nationalAssociationId: nullable(member.MemberNationalAssociationId),
  nickname: nullable(member.MemberNickname),
  officePhone: nullable(member.MemberOfficePhone),
  officePhoneExt: nullable(member.MemberOfficePhoneExt),
  pager: nullable(member.MemberPager),
  tollFreePhone: nullable(member.MemberTollFreePhone),
  status: nullable(member.MemberStatus),
  type: nullable(member.MemberType),
  emailYn: nullable(member.MemberEmailYN),
  active: true,
  raw: member,
});

export const memberLanguageRowsFromRecord = (member: MemberRecord, memberKey: string) =>
  (member.MemberLanguages ?? []).map((language) => ({
    memberKey,
    language,
  }));

export const memberDesignationRowsFromRecord = (member: MemberRecord, memberKey: string) =>
  (member.MemberDesignation ?? []).map((designation) => ({
    memberKey,
    designation,
  }));

export const socialMediaRowFromRecord = (socialMedia: SocialMedia, owner: SyncOwner) => ({
  socialMediaKey:
    stableKey(socialMedia.SocialMediaKey) ??
    fallbackKey(
      "social-media",
      [
        owner.resource,
        owner.key,
        stableKey(socialMedia.SocialMediaType),
        stableKey(socialMedia.SocialMediaUrlOrId),
      ],
      socialMedia,
    ),
  resource: owner.resource,
  resourceKey: owner.key,
  resourceRecordKey: nullable(socialMedia.ResourceRecordKey),
  socialMediaType: nullable(socialMedia.SocialMediaType),
  modificationTimestamp: timestampValue(socialMedia.ModificationTimestamp),
  resourceName: nullable(socialMedia.ResourceName),
  socialMediaUrlOrId: nullable(socialMedia.SocialMediaUrlOrId),
  raw: socialMedia,
});

export const socialMediaRowsFromRecord = (
  socialMedia: ReadonlyArray<SocialMedia> | null,
  owner: SyncOwner,
) => (socialMedia ?? []).map((record) => socialMediaRowFromRecord(record, owner));

export const officeRowFromRecord = (office: OfficeRecord) => ({
  officeKey: stableKey(office.OfficeKey),
  officeMlsId: nullable(office.OfficeMlsId),
  modificationTimestamp: timestampValue(office.ModificationTimestamp),
  originalEntryTimestamp: timestampValue(office.OriginalEntryTimestamp),
  officeName: nullable(office.OfficeName),
  officeAorKey: nullable(office.OfficeAORKey),
  officeAor: nullable(office.OfficeAOR),
  officeNationalAssociationId: nullable(office.OfficeNationalAssociationId),
  franchiseNationalAssociationId: nullable(office.FranchiseNationalAssociationId),
  officeBrokerNationalAssociationId: nullable(office.OfficeBrokerNationalAssociationId),
  address1: nullable(office.OfficeAddress1),
  address2: nullable(office.OfficeAddress2),
  city: nullable(office.OfficeCity),
  province: nullable(office.OfficeStateOrProvince),
  country: nullable(office.OfficeCountry),
  fax: nullable(office.OfficeFax),
  phone: nullable(office.OfficePhone),
  phoneExt: nullable(office.OfficePhoneExt),
  postalCode: nullable(office.OfficePostalCode),
  officeType: nullable(office.OfficeType),
  officeStatus: nullable(office.OfficeStatus),
  active: true,
  raw: office,
});

export const destinationRowFromRecord = (destination: Destination) => ({
  destinationId: nullable(destination.DestinationId),
  destinationName: nullable(destination.DestinationName),
  destinationUrl: nullable(destination.DestinationUrl),
  destinationType: nullable(destination.DestinationType),
  destinationStatus: nullable(destination.DestinationStatus),
  memberFirstName: nullable(destination.MemberFirstName),
  memberLastName: nullable(destination.MemberLastName),
  memberKey: nullable(destination.MemberKey),
  originalEntryTimestamp: timestampValue(destination.OriginalEntryTimestamp),
  modificationTimestamp: timestampValue(destination.ModificationTimestamp),
  fullNsp: nullable(destination.FullNSP),
  raw: destination,
});

export const openHouseRowFromRecord = (openHouse: OpenHouseRecord) => ({
  openHouseKey: stableKey(openHouse.OpenHouseKey),
  listingKey: nullable(openHouse.ListingKey),
  listingId: nullable(openHouse.ListingId),
  openHouseDate: dateValue(openHouse.OpenHouseDate),
  openHouseStartTime: timeValue(openHouse.OpenHouseStartTime),
  openHouseEndTime: timeValue(openHouse.OpenHouseEndTime),
  openHouseType: nullable(openHouse.OpenHouseType),
  openHouseStatus: nullable(openHouse.OpenHouseStatus),
  openHouseRemarks: nullable(openHouse.OpenHouseRemarks),
  livestreamOpenHouseUrl: nullable(openHouse.LivestreamOpenHouseURL),
  raw: openHouse,
});


export interface SerializedCause extends DdfSerializedCause {}

export interface SerializedSyncRecordError {
  readonly resource: SyncRecordError["resource"];
  readonly key: string;
  readonly stage: SyncRecordError["stage"];
  readonly message: string;
  readonly cause: SerializedCause;
}

const serializeCauseValue = (cause: unknown): SerializedCause => {
  if (Cause.isCause(cause)) {
    const squashed = Cause.squash(cause);
    const serialized = serializeCauseValue(squashed);
    return {
      ...serialized,
      type: "EffectCause",
      pretty: Cause.pretty(cause),
    };
  }
  if (cause instanceof Error) {
    return {
      type: "Error",
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  if (typeof cause === "object" && cause !== null) {
    const record = asRecord(cause);
    const message = arbitraryStringField(record, "message") ?? String(cause);
    const tag = arbitraryStringField(record, "_tag");
    return {
      type: tag ?? "Object",
      message,
    };
  }
  return {
    type: typeof cause,
    message: String(cause),
  };
};

export const serializeSyncRecordError = (
  error: SyncRecordError,
): SerializedSyncRecordError => ({
  resource: error.resource,
  key: error.key,
  stage: error.stage,
  message: error.message,
  cause: serializeCauseValue(error.cause),
});
const mapSinkError = (operation: string) => (cause: unknown) =>
  new DdfDatabaseSinkError({ operation, cause });

export type DdfDatabaseSyncSink = PropertySyncSink<DdfDatabaseSinkError> &
  MemberSyncSink<DdfDatabaseSinkError> &
  OfficeSyncSink<DdfDatabaseSinkError> &
  OpenHouseSyncSink<DdfDatabaseSinkError> & {
    readonly upsertDestination: (
      destination: Destination,
    ) => Effect.Effect<void, DdfDatabaseSinkError>;
    readonly recordSyncError: (
      error: SyncRecordError,
    ) => Effect.Effect<void, DdfDatabaseSinkError>;
  };

export const makeDdfDatabaseSyncSink = Effect.fn("DdfDatabaseSyncSink.make")(
  function* (options?: { readonly runId?: string }) {
    const { db } = yield* DdfDatabase;
    return {
      upsertDestination: Effect.fn("DdfDatabaseSyncSink.upsertDestination")(
        function* (destination: Destination) {
          const row = destinationRowFromRecord(destination);
          const destinationId = yield* requireNumberKey("upsertDestination", row.destinationId);
          yield* db
            .insert(ddfDestinations)
            .values({ ...row, destinationId })
            .onConflictDoUpdate({
              target: ddfDestinations.destinationId,
              set: { ...row, destinationId, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertDestination")));
        },
      ),
      upsertPropertyGraph: Effect.fn("DdfDatabaseSyncSink.upsertPropertyGraph")(
        function* (graph: PropertyGraph) {
          const propertyRow = propertyRowFromGraph(graph);
          const listingKey = yield* requireKey(
            "upsertPropertyGraph.property",
            propertyRow.listingKey,
          );
          yield* db
            .insert(ddfProperties)
            .values({ ...propertyRow, listingKey })
            .onConflictDoUpdate({
              target: ddfProperties.listingKey,
              set: { ...propertyRow, listingKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertPropertyGraph")));
        },
      ),
      upsertMemberWithMedia: Effect.fn("DdfDatabaseSyncSink.upsertMemberWithMedia")(
        function* (member, media) {
          const row = memberRowFromRecord(member);
          const memberKey = yield* requireKey("upsertMemberWithMedia", row.memberKey);
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfMembers)
                .values({ ...row, memberKey })
                .onConflictDoUpdate({
                  target: ddfMembers.memberKey,
                  set: { ...row, memberKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(eq(ddfMedia.resource, "Member"), eq(ddfMedia.resourceKey, memberKey)),
                );
              yield* tx
                .delete(ddfSocialMedia)
                .where(
                  and(eq(ddfSocialMedia.resource, "Member"), eq(ddfSocialMedia.resourceKey, memberKey)),
                );
              yield* tx
                .delete(ddfMemberLanguages)
                .where(eq(ddfMemberLanguages.memberKey, memberKey));
              yield* tx
                .delete(ddfMemberDesignations)
                .where(eq(ddfMemberDesignations.memberKey, memberKey));
              yield* Effect.forEach(
                memberLanguageRowsFromRecord(member, memberKey),
                (languageRow) => tx.insert(ddfMemberLanguages).values(languageRow),
                { discard: true },
              );
              yield* Effect.forEach(
                memberDesignationRowsFromRecord(member, memberKey),
                (designationRow) => tx.insert(ddfMemberDesignations).values(designationRow),
                { discard: true },
              );
              yield* Effect.forEach(
                socialMediaRowsFromRecord(member.MemberSocialMedia ?? null, { resource: "Member", key: memberKey }),
                (socialMediaRow) =>
                  Effect.gen(function* () {
                    const socialMediaKey = yield* requireKey(
                      "upsertMemberWithMedia.socialMediaKey",
                      socialMediaRow.socialMediaKey.length > 0 ? socialMediaRow.socialMediaKey : null,
                    );
                    yield* tx
                      .insert(ddfSocialMedia)
                      .values({ ...socialMediaRow, socialMediaKey })
                      .onConflictDoUpdate({
                        target: ddfSocialMedia.socialMediaKey,
                        set: { ...socialMediaRow, socialMediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
              yield* Effect.forEach(
                media,
                (mediaRecord) =>
                  Effect.gen(function* () {
                    const mediaRow = mediaRowFromRecord(mediaRecord, {
                      resource: "Member",
                      key: memberKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertMemberWithMedia.mediaKey",
                      mediaRow.mediaKey.length > 0 ? mediaRow.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...mediaRow, mediaKey })
                      .onConflictDoUpdate({
                        target: ddfMedia.mediaKey,
                        set: { ...mediaRow, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertMemberWithMedia")));
        },
      ),
      upsertOfficeWithMedia: Effect.fn("DdfDatabaseSyncSink.upsertOfficeWithMedia")(
        function* (office, media) {
          const row = officeRowFromRecord(office);
          const officeKey = yield* requireKey("upsertOfficeWithMedia", row.officeKey);
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfOffices)
                .values({ ...row, officeKey })
                .onConflictDoUpdate({
                  target: ddfOffices.officeKey,
                  set: { ...row, officeKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(eq(ddfMedia.resource, "Office"), eq(ddfMedia.resourceKey, officeKey)),
                );
              yield* tx
                .delete(ddfSocialMedia)
                .where(
                  and(eq(ddfSocialMedia.resource, "Office"), eq(ddfSocialMedia.resourceKey, officeKey)),
                );
              yield* Effect.forEach(
                socialMediaRowsFromRecord(office.OfficeSocialMedia ?? null, { resource: "Office", key: officeKey }),
                (socialMediaRow) =>
                  Effect.gen(function* () {
                    const socialMediaKey = yield* requireKey(
                      "upsertOfficeWithMedia.socialMediaKey",
                      socialMediaRow.socialMediaKey.length > 0 ? socialMediaRow.socialMediaKey : null,
                    );
                    yield* tx
                      .insert(ddfSocialMedia)
                      .values({ ...socialMediaRow, socialMediaKey })
                      .onConflictDoUpdate({
                        target: ddfSocialMedia.socialMediaKey,
                        set: { ...socialMediaRow, socialMediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
              yield* Effect.forEach(
                media,
                (mediaRecord) =>
                  Effect.gen(function* () {
                    const mediaRow = mediaRowFromRecord(mediaRecord, {
                      resource: "Office",
                      key: officeKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertOfficeWithMedia.mediaKey",
                      mediaRow.mediaKey.length > 0 ? mediaRow.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...mediaRow, mediaKey })
                      .onConflictDoUpdate({
                        target: ddfMedia.mediaKey,
                        set: { ...mediaRow, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertOfficeWithMedia")));
        },
      ),
      upsertProperty: Effect.fn("DdfDatabaseSyncSink.upsertProperty")(
        function* (property) {
          const row = propertyRowFromRecord(property);
          const listingKey = yield* requireKey("upsertProperty", row.listingKey);
          yield* db
            .insert(ddfProperties)
            .values({ ...row, listingKey })
            .onConflictDoUpdate({
              target: ddfProperties.listingKey,
              set: { ...row, listingKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertProperty")));
        },
      ),
      upsertRoom: Effect.fn("DdfDatabaseSyncSink.upsertRoom")(function* (
        room,
        property,
      ) {
        const row = roomRowFromRecord(room, property);
        const listingKey = yield* requireKey(
          "upsertRoom.listingKey",
          row.listingKey,
        );
        const roomKey = yield* requireKey(
          "upsertRoom.roomKey",
          row.roomKey.length > 0 ? row.roomKey : null,
        );
        yield* db
          .insert(ddfPropertyRooms)
          .values({ ...row, listingKey, roomKey })
          .onConflictDoUpdate({
            target: ddfPropertyRooms.roomKey,
            set: { ...row, listingKey, roomKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertRoom")));
      }),
      upsertMedia: Effect.fn("DdfDatabaseSyncSink.upsertMedia")(function* (
        media,
        owner,
      ) {
        const row = mediaRowFromRecord(media, owner);
        const mediaKey = yield* requireKey(
          "upsertMedia",
          row.mediaKey.length > 0 ? row.mediaKey : null,
        );
        yield* db
          .insert(ddfMedia)
          .values({ ...row, mediaKey })
          .onConflictDoUpdate({
            target: ddfMedia.mediaKey,
            set: { ...row, mediaKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertMedia")));
      }),
      upsertSocialMedia: Effect.fn("DdfDatabaseSyncSink.upsertSocialMedia")(
        function* (socialMedia, owner) {
          const row = socialMediaRowFromRecord(socialMedia, owner);
          const socialMediaKey = yield* requireKey(
            "upsertSocialMedia",
            row.socialMediaKey.length > 0 ? row.socialMediaKey : null,
          );
          yield* db
            .insert(ddfSocialMedia)
            .values({ ...row, socialMediaKey })
            .onConflictDoUpdate({
              target: ddfSocialMedia.socialMediaKey,
              set: { ...row, socialMediaKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertSocialMedia")));
        },
      ),
      upsertMember: Effect.fn("DdfDatabaseSyncSink.upsertMember")(function* (
        member,
      ) {
        const row = memberRowFromRecord(member);
        const memberKey = yield* requireKey("upsertMember", row.memberKey);
        yield* db
          .insert(ddfMembers)
          .values({ ...row, memberKey })
          .onConflictDoUpdate({
            target: ddfMembers.memberKey,
            set: { ...row, memberKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertMember")));
      }),
      upsertOffice: Effect.fn("DdfDatabaseSyncSink.upsertOffice")(function* (
        office,
      ) {
        const row = officeRowFromRecord(office);
        const officeKey = yield* requireKey("upsertOffice", row.officeKey);
        yield* db
          .insert(ddfOffices)
          .values({ ...row, officeKey })
          .onConflictDoUpdate({
            target: ddfOffices.officeKey,
            set: { ...row, officeKey, ...touchUpdatedAt },
          })
          .pipe(Effect.mapError(mapSinkError("upsertOffice")));
      }),
      upsertOpenHouse: Effect.fn("DdfDatabaseSyncSink.upsertOpenHouse")(
        function* (openHouse) {
          const row = openHouseRowFromRecord(openHouse);
          const openHouseKey = yield* requireKey(
            "upsertOpenHouse",
            row.openHouseKey,
          );
          yield* db
            .insert(ddfOpenHouses)
            .values({ ...row, openHouseKey })
            .onConflictDoUpdate({
              target: ddfOpenHouses.openHouseKey,
              set: { ...row, openHouseKey, ...touchUpdatedAt },
            })
            .pipe(Effect.mapError(mapSinkError("upsertOpenHouse")));
        },
      ),
      markMissingPropertiesInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingPropertiesInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfProperties)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfProperties.listingKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingPropertiesInactive")));
      }),
      markMissingMembersInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingMembersInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfMembers)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfMembers.memberKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingMembersInactive")));
      }),
      markMissingOfficesInactive: Effect.fn(
        "DdfDatabaseSyncSink.markMissingOfficesInactive",
      )(function* (keys) {
        if (keys.length === 0) return;
        yield* db
          .update(ddfOffices)
          .set({ active: false, ...touchUpdatedAt })
          .where(inArray(ddfOffices.officeKey, keys))
          .pipe(Effect.mapError(mapSinkError("markMissingOfficesInactive")));
      }),
      recordSyncError: Effect.fn("DdfDatabaseSyncSink.recordSyncError")(
        function* (error) {
          const id = [
            options?.runId ?? "adhoc",
            error.resource,
            error.key,
            error.stage,
            error.message,
          ].join(":");
          const serialized = serializeSyncRecordError(error);
          yield* db
            .insert(ddfSyncErrors)
            .values({
              id,
              runId: options?.runId ?? null,
              resource: serialized.resource,
              recordKey: serialized.key,
              stage: serialized.stage,
              message: serialized.message,
              cause: serialized.cause,
            })
            .onConflictDoUpdate({
              target: ddfSyncErrors.id,
              set: { message: serialized.message, cause: serialized.cause },
            })
            .pipe(Effect.mapError(mapSinkError("recordSyncError")));
        },
      ),
    } satisfies DdfDatabaseSyncSink;
  },
);
