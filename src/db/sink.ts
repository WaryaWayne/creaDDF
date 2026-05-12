import { and, eq, inArray } from "drizzle-orm";
import { Cause, Data, DateTime, Effect } from "effect";
import type {
  MemberSyncSink,
  OfficeSyncSink,
  OpenHouseSyncSink,
  PropertyGraph,
  PropertySyncSink,
  SyncOwner,
  SyncRecordError,
} from "../sync";
import { DdfDatabase } from "./layer";
import {
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

const stringField = (record: JsonRecord, field: string): string | null => {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const numberField = (record: JsonRecord, field: string): number | null => {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const booleanField = (record: JsonRecord, field: string): boolean | null => {
  const value = record[field];
  return typeof value === "boolean" ? value : null;
};

const arrayField = (record: JsonRecord, field: string): ReadonlyArray<unknown> | null => {
  const value = record[field];
  return Array.isArray(value) ? value : null;
};

const jsonField = (record: JsonRecord, field: string): unknown =>
  record[field] ?? null;

const dateField = (record: JsonRecord, field: string): string | null => {
  const value = record[field];
  const iso = value instanceof Date
    ? value.toISOString()
    : DateTime.isDateTime(value)
      ? DateTime.formatIso(value)
      : typeof value === "string"
        ? value
        : null;
  return iso === null ? null : iso.slice(0, 10);
};

const timeField = (record: JsonRecord, field: string): string | null => {
  const value = stringField(record, field);
  if (value === null) return null;
  const match = /^(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(value);
  return match?.[1] ?? null;
};

const timestampField = (record: JsonRecord, field: string): Date | null => {
  const value = record[field];

  if (value instanceof Date) return value;

  if (DateTime.isDateTime(value)) {
    const millis = Date.parse(DateTime.formatIso(value));
    return Number.isFinite(millis) ? new Date(millis) : null;
  }

  if (typeof value !== "string") return null;

  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis) : null;
};

const requireKey = (operation: string, key: string | null) =>
  key === null
    ? Effect.fail(
        new DdfDatabaseSinkError({
          operation,
          cause: new Error(`Missing stable key for ${operation}`),
        }),
      )
    : Effect.succeed(key);

export const propertyRowFromRecord = (property: unknown) => {
  const record = asRecord(property);
  return {
    listingKey: stringField(record, "ListingKey"),
    listingId: stringField(record, "ListingId"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    originalEntryTimestamp: timestampField(record, "OriginalEntryTimestamp"),
    availabilityDate: dateField(record, "AvailabilityDate"),
    statusChangeTimestamp: timestampField(record, "StatusChangeTimestamp"),
    photosChangeTimestamp: timestampField(record, "PhotosChangeTimestamp"),
    standardStatus: stringField(record, "StandardStatus"),
    propertySubType: stringField(record, "PropertySubType"),
    businessType: jsonField(record, "BusinessType"),
    propertyType: stringField(record, "PropertyType"),
    publicRemarks: stringField(record, "PublicRemarks"),
    listPrice: numberField(record, "ListPrice"),
    leaseAmount: numberField(record, "LeaseAmount"),
    leaseAmountFrequency: stringField(record, "LeaseAmountFrequency"),
    leasePerUnit: stringField(record, "LeasePerUnit"),
    pricePerUnit: numberField(record, "PricePerUnit"),
    associationFee: numberField(record, "AssociationFee"),
    associationFeeFrequency: stringField(record, "AssociationFeeFrequency"),
    associationName: stringField(record, "AssociationName"),
    associationFeeIncludes: jsonField(record, "AssociationFeeIncludes"),
    totalActualRent: numberField(record, "TotalActualRent"),
    existingLeaseType: jsonField(record, "ExistingLeaseType"),
    listOfficeKey: stringField(record, "ListOfficeKey"),
    coListOfficeKey: stringField(record, "CoListOfficeKey"),
    coListOfficeKey2: stringField(record, "CoListOfficeKey2"),
    coListOfficeKey3: stringField(record, "CoListOfficeKey3"),
    listAgentKey: stringField(record, "ListAgentKey"),
    coListAgentKey: stringField(record, "CoListAgentKey"),
    coListAgentKey2: stringField(record, "CoListAgentKey2"),
    coListAgentKey3: stringField(record, "CoListAgentKey3"),
    listingUrl: stringField(record, "ListingURL"),
    originatingSystemName: stringField(record, "OriginatingSystemName"),
    photosCount: numberField(record, "PhotosCount"),
    commonInterest: stringField(record, "CommonInterest"),
    listAor: stringField(record, "ListAOR"),
    listAorKey: stringField(record, "ListAORKey"),
    unparsedAddress: stringField(record, "UnparsedAddress"),
    postalCode: stringField(record, "PostalCode"),
    subdivisionName: stringField(record, "SubdivisionName"),
    province: stringField(record, "StateOrProvince"),
    streetDirPrefix: stringField(record, "StreetDirPrefix"),
    streetDirSuffix: stringField(record, "StreetDirSuffix"),
    streetName: stringField(record, "StreetName"),
    streetNumber: stringField(record, "StreetNumber"),
    streetSuffix: stringField(record, "StreetSuffix"),
    unitNumber: stringField(record, "UnitNumber"),
    country: stringField(record, "Country"),
    city: stringField(record, "City"),
    directions: stringField(record, "Directions"),
    cityRegion: stringField(record, "CityRegion"),
    latitude: numberField(record, "Latitude"),
    longitude: numberField(record, "Longitude"),
    mapCoordinateVerified: booleanField(record, "MapCoordinateVerifiedYN"),
    geocodeManual: booleanField(record, "GeocodeManualYN"),
    parkingTotal: numberField(record, "ParkingTotal"),
    parkingFeatures: jsonField(record, "ParkingFeatures"),
    yearBuilt: numberField(record, "YearBuilt"),
    bathroomsPartial: numberField(record, "BathroomsPartial"),
    bathroomsTotalInteger: numberField(record, "BathroomsTotalInteger"),
    bedroomsTotal: numberField(record, "BedroomsTotal"),
    bedroomsAboveGrade: numberField(record, "BedroomsAboveGrade"),
    bedroomsBelowGrade: numberField(record, "BedroomsBelowGrade"),
    buildingAreaTotal: numberField(record, "BuildingAreaTotal"),
    buildingAreaUnits: stringField(record, "BuildingAreaUnits"),
    buildingFeatures: jsonField(record, "BuildingFeatures"),
    aboveGradeFinishedArea: numberField(record, "AboveGradeFinishedArea"),
    aboveGradeFinishedAreaUnits: stringField(record, "AboveGradeFinishedAreaUnits"),
    aboveGradeFinishedAreaSource: stringField(record, "AboveGradeFinishedAreaSource"),
    aboveGradeFinishedAreaMinimum: numberField(record, "AboveGradeFinishedAreaMinimum"),
    aboveGradeFinishedAreaMaximum: numberField(record, "AboveGradeFinishedAreaMaximum"),
    belowGradeFinishedArea: numberField(record, "BelowGradeFinishedArea"),
    belowGradeFinishedAreaUnits: stringField(record, "BelowGradeFinishedAreaUnits"),
    belowGradeFinishedAreaSource: stringField(record, "BelowGradeFinishedAreaSource"),
    belowGradeFinishedAreaMinimum: numberField(record, "BelowGradeFinishedAreaMinimum"),
    belowGradeFinishedAreaMaximum: numberField(record, "BelowGradeFinishedAreaMaximum"),
    livingArea: numberField(record, "LivingArea"),
    livingAreaUnits: stringField(record, "LivingAreaUnits"),
    livingAreaSource: stringField(record, "LivingAreaSource"),
    livingAreaMinimum: numberField(record, "LivingAreaMinimum"),
    livingAreaMaximum: numberField(record, "LivingAreaMaximum"),
    firePlacesTotal: numberField(record, "FireplacesTotal"),
    fireplace: booleanField(record, "FireplaceYN"),
    fireplaceFeatures: jsonField(record, "FireplaceFeatures"),
    architecturalStyle: jsonField(record, "ArchitecturalStyle"),
    heating: jsonField(record, "Heating"),
    foundationDetails: jsonField(record, "FoundationDetails"),
    basement: jsonField(record, "Basement"),
    exteriorFeatures: jsonField(record, "ExteriorFeatures"),
    flooring: jsonField(record, "Flooring"),
    cooling: jsonField(record, "Cooling"),
    propertyCondition: jsonField(record, "PropertyCondition"),
    roof: jsonField(record, "Roof"),
    constructionMaterials: jsonField(record, "ConstructionMaterials"),
    stories: numberField(record, "Stories"),
    propertyAttached: booleanField(record, "PropertyAttachedYN"),
    accessibilityFeatures: jsonField(record, "AccessibilityFeatures"),
    zoning: stringField(record, "Zoning"),
    zoningDescription: stringField(record, "ZoningDescription"),
    taxAnnualAmount: numberField(record, "TaxAnnualAmount"),
    taxBlock: stringField(record, "TaxBlock"),
    taxLot: stringField(record, "TaxLot"),
    taxYear: numberField(record, "TaxYear"),
    structureType: jsonField(record, "StructureType"),
    parcelNumber: stringField(record, "ParcelNumber"),
    utilities: jsonField(record, "Utilities"),
    irrigationSource: jsonField(record, "IrrigationSource"),
    waterSource: jsonField(record, "WaterSource"),
    sewer: jsonField(record, "Sewer"),
    electric: jsonField(record, "Electric"),
    documentsAvailable: jsonField(record, "DocumentsAvailable"),
    waterBodyName: stringField(record, "WaterBodyName"),
    view: jsonField(record, "View"),
    numberOfBuildings: numberField(record, "NumberOfBuildings"),
    numberOfUnitsTotal: numberField(record, "NumberOfUnitsTotal"),
    lotFeatures: jsonField(record, "LotFeatures"),
    lotSizeArea: numberField(record, "LotSizeArea"),
    lotSizeDimensions: stringField(record, "LotSizeDimensions"),
    lotSizeUnits: stringField(record, "LotSizeUnits"),
    poolFeatures: jsonField(record, "PoolFeatures"),
    roadSurfaceType: jsonField(record, "RoadSurfaceType"),
    currentUse: jsonField(record, "CurrentUse"),
    possibleUse: jsonField(record, "PossibleUse"),
    anchorsCoTenants: stringField(record, "AnchorsCoTenants"),
    waterfrontFeatures: jsonField(record, "WaterfrontFeatures"),
    communityFeatures: jsonField(record, "CommunityFeatures"),
    frontageLengthNumeric: numberField(record, "FrontageLengthNumeric"),
    frontageLengthNumericUnits: stringField(record, "FrontageLengthNumericUnits"),
    fencing: jsonField(record, "Fencing"),
    appliances: jsonField(record, "Appliances"),
    otherEquipment: jsonField(record, "OtherEquipment"),
    securityFeatures: jsonField(record, "SecurityFeatures"),
    inclusions: stringField(record, "Inclusions"),
    internetEntireListingDisplay: booleanField(record, "InternetEntireListingDisplayYN"),
    internetAddressDisplay: booleanField(record, "InternetAddressDisplayYN"),
    active: true,
    raw: property,
  };
};

export const roomRowFromRecord = (room: unknown, property: unknown) => {
  const roomRecord = asRecord(room);
  const propertyRecord = asRecord(property);
  const listingKey =
    stringField(roomRecord, "ListingKey") ?? stringField(propertyRecord, "ListingKey");
  return {
    listingKey,
    listingId: stringField(roomRecord, "ListingId") ?? stringField(propertyRecord, "ListingId"),
    roomKey:
      stringField(roomRecord, "RoomKey") ??
      [listingKey, stringField(roomRecord, "RoomType"), stringField(roomRecord, "RoomLevel")]
        .filter((part): part is string => part !== null)
        .join(":"),
    modificationTimestamp: timestampField(roomRecord, "ModificationTimestamp"),
    roomDescription: stringField(roomRecord, "RoomDescription"),
    roomDimensions: stringField(roomRecord, "RoomDimensions"),
    roomLength: numberField(roomRecord, "RoomLength"),
    roomLevel: stringField(roomRecord, "RoomLevel"),
    roomWidth: numberField(roomRecord, "RoomWidth"),
    roomLengthWidthUnits: stringField(roomRecord, "RoomLengthWidthUnits"),
    roomType: stringField(roomRecord, "RoomType"),
    raw: room,
  };
};

export const mediaRowFromRecord = (media: unknown, owner: SyncOwner) => {
  const record = asRecord(media);
  return {
    mediaKey:
      stringField(record, "MediaKey") ??
      [owner.resource, owner.key, stringField(record, "MediaURL"), numberField(record, "Order")]
        .filter((part): part is string | number => part !== null)
        .join(":"),
    resource: owner.resource,
    resourceKey: owner.key,
    resourceRecordId: stringField(record, "ResourceRecordId"),
    resourceRecordKey: stringField(record, "ResourceRecordKey"),
    resourceName: stringField(record, "ResourceName"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    mediaUrl: stringField(record, "MediaURL"),
    mediaCategory: stringField(record, "MediaCategory"),
    longDescription: stringField(record, "LongDescription"),
    preferredPhoto: booleanField(record, "PreferredPhotoYN"),
    sortOrder: numberField(record, "Order"),
    raw: media,
  };
};

export const memberRowFromRecord = (member: unknown) => {
  const record = asRecord(member);
  return {
    memberKey: stringField(record, "MemberKey"),
    memberMlsId: stringField(record, "MemberMlsId"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    originalEntryTimestamp: timestampField(record, "OriginalEntryTimestamp"),
    officeKey: stringField(record, "OfficeKey"),
    officeNationalAssociationId: stringField(record, "OfficeNationalAssociationId"),
    jobTitle: stringField(record, "JobTitle"),
    memberAorKey: stringField(record, "MemberAORKey"),
    memberAor: stringField(record, "MemberAOR"),
    address1: stringField(record, "MemberAddress1"),
    address2: stringField(record, "MemberAddress2"),
    city: stringField(record, "MemberCity"),
    province: stringField(record, "MemberStateOrProvince"),
    country: stringField(record, "MemberCountry"),
    postalCode: stringField(record, "MemberPostalCode"),
    fax: stringField(record, "MemberFax"),
    firstName: stringField(record, "MemberFirstName"),
    lastName: stringField(record, "MemberLastName"),
    middleName: stringField(record, "MemberMiddleName"),
    namePrefix: stringField(record, "MemberNamePrefix"),
    nameSuffix: stringField(record, "MemberNameSuffix"),
    nationalAssociationId: stringField(record, "MemberNationalAssociationId"),
    nickname: stringField(record, "MemberNickname"),
    officePhone: stringField(record, "MemberOfficePhone"),
    officePhoneExt: stringField(record, "MemberOfficePhoneExt"),
    pager: stringField(record, "MemberPager"),
    tollFreePhone: stringField(record, "MemberTollFreePhone"),
    status: stringField(record, "MemberStatus"),
    type: stringField(record, "MemberType"),
    email: stringField(record, "MemberEmail"),
    emailYn: booleanField(record, "MemberEmailYN"),
    active: true,
    raw: member,
  };
};

export const memberLanguageRowsFromRecord = (member: unknown, memberKey: string) => {
  const rows = arrayField(asRecord(member), "MemberLanguages") ?? [];
  return rows.filter((language): language is string => typeof language === "string").map((language) => ({
    memberKey,
    language,
  }));
};

export const memberDesignationRowsFromRecord = (member: unknown, memberKey: string) => {
  const rows = arrayField(asRecord(member), "MemberDesignation") ?? [];
  return rows.filter((designation): designation is string => typeof designation === "string").map((designation) => ({
    memberKey,
    designation,
  }));
};

export const socialMediaRowFromRecord = (socialMedia: unknown, owner: SyncOwner) => {
  const record = asRecord(socialMedia);
  return {
    socialMediaKey:
      stringField(record, "SocialMediaKey") ??
      [owner.resource, owner.key, stringField(record, "SocialMediaType"), stringField(record, "SocialMediaUrlOrId")]
        .filter((part): part is string => part !== null)
        .join(":"),
    resource: owner.resource,
    resourceKey: owner.key,
    resourceRecordKey: stringField(record, "ResourceRecordKey"),
    socialMediaType: stringField(record, "SocialMediaType"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    resourceName: stringField(record, "ResourceName"),
    socialMediaUrlOrId: stringField(record, "SocialMediaUrlOrId"),
    raw: socialMedia,
  };
};

export const socialMediaRowsFromRecord = (
  record: unknown,
  owner: SyncOwner,
  field: "MemberSocialMedia" | "OfficeSocialMedia",
) => (arrayField(asRecord(record), field) ?? []).map((socialMedia) => socialMediaRowFromRecord(socialMedia, owner));

export const officeRowFromRecord = (office: unknown) => {
  const record = asRecord(office);
  return {
    officeKey: stringField(record, "OfficeKey"),
    officeMlsId: stringField(record, "OfficeMlsId"),
    modificationTimestamp: timestampField(record, "ModificationTimestamp"),
    originalEntryTimestamp: timestampField(record, "OriginalEntryTimestamp"),
    officeName: stringField(record, "OfficeName"),
    officeAorKey: stringField(record, "OfficeAORKey"),
    officeAor: stringField(record, "OfficeAOR"),
    officeNationalAssociationId: stringField(record, "OfficeNationalAssociationId"),
    franchiseNationalAssociationId: stringField(record, "FranchiseNationalAssociationId"),
    officeBrokerNationalAssociationId: stringField(record, "OfficeBrokerNationalAssociationId"),
    address1: stringField(record, "OfficeAddress1"),
    address2: stringField(record, "OfficeAddress2"),
    city: stringField(record, "OfficeCity"),
    province: stringField(record, "OfficeStateOrProvince"),
    country: stringField(record, "OfficeCountry"),
    fax: stringField(record, "OfficeFax"),
    phone: stringField(record, "OfficePhone"),
    phoneExt: stringField(record, "OfficePhoneExt"),
    postalCode: stringField(record, "OfficePostalCode"),
    officeType: stringField(record, "OfficeType"),
    officeStatus: stringField(record, "OfficeStatus"),
    active: true,
    raw: office,
  };
};

export const openHouseRowFromRecord = (openHouse: unknown) => {
  const record = asRecord(openHouse);
  return {
    openHouseKey: stringField(record, "OpenHouseKey"),
    listingKey: stringField(record, "ListingKey"),
    listingId: stringField(record, "ListingId"),
    openHouseDate: dateField(record, "OpenHouseDate"),
    openHouseStartTime: timeField(record, "OpenHouseStartTime"),
    openHouseEndTime: timeField(record, "OpenHouseEndTime"),
    openHouseType: stringField(record, "OpenHouseType"),
    openHouseStatus: stringField(record, "OpenHouseStatus"),
    openHouseRemarks: stringField(record, "OpenHouseRemarks"),
    livestreamOpenHouseUrl: stringField(record, "LivestreamOpenHouseURL"),
    raw: openHouse,
  };
};


export interface SerializedCause {
  readonly type: string;
  readonly message: string;
  readonly name?: string;
  readonly stack?: string;
  readonly pretty?: string;
}

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
    const message = stringField(record, "message") ?? String(cause);
    const tag = stringField(record, "_tag");
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

export type DdfDatabaseSyncSink = PropertySyncSink &
  MemberSyncSink &
  OfficeSyncSink &
  OpenHouseSyncSink & {
    readonly recordSyncError: (
      error: SyncRecordError,
    ) => Effect.Effect<void, DdfDatabaseSinkError>;
  };

export const makeDdfDatabaseSyncSink = Effect.fn("DdfDatabaseSyncSink.make")(
  function* (options?: { readonly runId?: string }) {
    const { db } = yield* DdfDatabase;
    return {
      upsertPropertyGraph: Effect.fn("DdfDatabaseSyncSink.upsertPropertyGraph")(
        function* (graph: PropertyGraph) {
          const propertyRow = propertyRowFromRecord(graph.property);
          const listingKey = yield* requireKey(
            "upsertPropertyGraph.property",
            propertyRow.listingKey,
          );
          yield* db.transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(ddfProperties)
                .values({ ...propertyRow, listingKey })
                .onConflictDoUpdate({
                  target: ddfProperties.listingKey,
                  set: { ...propertyRow, listingKey, ...touchUpdatedAt },
                });
              yield* tx
                .delete(ddfPropertyRooms)
                .where(eq(ddfPropertyRooms.listingKey, listingKey));
              yield* tx
                .delete(ddfMedia)
                .where(
                  and(
                    eq(ddfMedia.resource, "Property"),
                    eq(ddfMedia.resourceKey, listingKey),
                  ),
                );
              yield* Effect.forEach(
                graph.rooms,
                (room) =>
                  Effect.gen(function* () {
                    const row = roomRowFromRecord(room, graph.property);
                    const roomListingKey = yield* requireKey(
                      "upsertPropertyGraph.roomListingKey",
                      row.listingKey,
                    );
                    const roomKey = yield* requireKey(
                      "upsertPropertyGraph.roomKey",
                      row.roomKey.length > 0 ? row.roomKey : null,
                    );
                    yield* tx
                      .insert(ddfPropertyRooms)
                      .values({ ...row, listingKey: roomListingKey, roomKey })
                      .onConflictDoUpdate({
                        target: ddfPropertyRooms.roomKey,
                        set: { ...row, listingKey: roomListingKey, roomKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
              yield* Effect.forEach(
                graph.media,
                (media) =>
                  Effect.gen(function* () {
                    const row = mediaRowFromRecord(media, {
                      resource: "Property",
                      key: listingKey,
                    });
                    const mediaKey = yield* requireKey(
                      "upsertPropertyGraph.mediaKey",
                      row.mediaKey.length > 0 ? row.mediaKey : null,
                    );
                    yield* tx
                      .insert(ddfMedia)
                      .values({ ...row, mediaKey })
                      .onConflictDoUpdate({
                        target: ddfMedia.mediaKey,
                        set: { ...row, mediaKey, ...touchUpdatedAt },
                      });
                  }),
                { discard: true },
              );
            }),
          ).pipe(Effect.mapError(mapSinkError("upsertPropertyGraph")));
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
                socialMediaRowsFromRecord(member, { resource: "Member", key: memberKey }, "MemberSocialMedia"),
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
                socialMediaRowsFromRecord(office, { resource: "Office", key: officeKey }, "OfficeSocialMedia"),
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
