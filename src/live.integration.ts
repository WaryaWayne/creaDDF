import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Config, Effect, Redacted } from "effect";
import { makeDdfLayer } from "./client";
import {
  getDestination,
  getMember,
  getOffice,
  getOpenHouse,
  getProperty,
  listDestinations,
  listMembers,
  listOffices,
  listOpenHouses,
  listProperties,
  replicateMembers,
  replicateMembersForDestination,
  replicateOffices,
  replicateOfficesForDestination,
  replicateProperties,
  replicatePropertiesForDestination,
} from "./resources";

const liveEnvNames = [
  "CREA_DDF_CLIENT_ID",
  "CREA_DDF_CLIENT_SECRET",
  "CREA_DDF_BASE_URL",
  "CREA_DDF_AUTH_URL",
  "CREA_ANALYTICS_URL",
  "CREA_DESTINATION_ID",
] as const;

const requiredLiveEnvNames = [
  "CREA_DDF_CLIENT_ID",
  "CREA_DDF_CLIENT_SECRET",
] as const;

const visibleLiveEnvNames = liveEnvNames.filter(
  (name) => process.env[name] !== undefined && process.env[name] !== "",
);
const missingRequiredLiveEnvNames = requiredLiveEnvNames.filter(
  (name) => process.env[name] === undefined || process.env[name] === "",
);
const hasLiveCredentials = missingRequiredLiveEnvNames.length === 0;

const LiveDdfConfig = Config.all({
  clientId: Config.redacted("CREA_DDF_CLIENT_ID"),
  clientSecret: Config.redacted("CREA_DDF_CLIENT_SECRET"),
  baseUrl: Config.string("CREA_DDF_BASE_URL").pipe(
    Config.withDefault(undefined),
  ),
  identityUrl: Config.string("CREA_DDF_AUTH_URL").pipe(
    Config.withDefault(undefined),
  ),
  analyticsUrl: Config.string("CREA_ANALYTICS_URL").pipe(
    Config.withDefault(undefined),
  ),
});

const maybeLive = hasLiveCredentials ? describe : describe.skip;

maybeLive("live CREA/DDF integration", () => {
  it("proves read-only resource wrappers with small selected queries", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* LiveDdfConfig;
        const layer = makeDdfLayer({
          clientId: Redacted.value(config.clientId),
          clientSecret: Redacted.value(config.clientSecret),
          baseUrl: config.baseUrl,
          identityUrl: config.identityUrl,
          analyticsUrl: config.analyticsUrl,
        });

        return yield* Effect.gen(function* () {
          const destinations = yield* listDestinations({
            select: ["DestinationId"],
            top: 1,
          });
          const properties = yield* listProperties({
            select: ["ListingKey", "ModificationTimestamp"],
            top: 1,
          });
          const members = yield* listMembers({ select: ["MemberKey"], top: 1 });
          const offices = yield* listOffices({ select: ["OfficeKey"], top: 1 });
          const openHouses = yield* listOpenHouses({
            select: ["OpenHouseKey"],
            top: 1,
          });

          const configuredDestinationId =
            process.env.CREA_DESTINATION_ID &&
            process.env.CREA_DESTINATION_ID !== ""
              ? Number(process.env.CREA_DESTINATION_ID)
              : undefined;
          const firstDestinationId = Number.isInteger(configuredDestinationId)
            ? configuredDestinationId
            : destinations.value[0]?.DestinationId;
          const firstListingKey = properties.value[0]?.ListingKey;
          const firstMemberKey = members.value[0]?.MemberKey;
          const firstOfficeKey = offices.value[0]?.OfficeKey;
          const firstOpenHouseKey = openHouses.value[0]?.OpenHouseKey;

          const destination =
            typeof firstDestinationId === "number"
              ? yield* getDestination(firstDestinationId, {
                  select: ["DestinationId"],
                })
              : undefined;
          const property =
            typeof firstListingKey === "string"
              ? yield* getProperty(firstListingKey, { select: ["ListingKey"] })
              : undefined;
          const member =
            typeof firstMemberKey === "string"
              ? yield* getMember(firstMemberKey, { select: ["MemberKey"] })
              : undefined;
          const office =
            typeof firstOfficeKey === "string"
              ? yield* getOffice(firstOfficeKey, { select: ["OfficeKey"] })
              : undefined;
          const openHouse =
            typeof firstOpenHouseKey === "string"
              ? yield* getOpenHouse(firstOpenHouseKey, {
                  select: ["OpenHouseKey"],
                })
              : undefined;

          const replicationQuery = { count: true } as const;
          const propertyReplication =
            typeof firstDestinationId === "number"
              ? yield* replicatePropertiesForDestination(
                  firstDestinationId,
                  replicationQuery,
                )
              : yield* replicateProperties(replicationQuery);
          const memberReplication =
            typeof firstDestinationId === "number"
              ? yield* replicateMembersForDestination(
                  firstDestinationId,
                  replicationQuery,
                )
              : yield* replicateMembers(replicationQuery);
          const officeReplication =
            typeof firstDestinationId === "number"
              ? yield* replicateOfficesForDestination(
                  firstDestinationId,
                  replicationQuery,
                )
              : yield* replicateOffices(replicationQuery);

          return {
            destinations,
            properties,
            members,
            offices,
            openHouses,
            destination,
            property,
            member,
            office,
            openHouse,
            propertyReplication,
            memberReplication,
            officeReplication,
          };
        }).pipe(Effect.provide(layer));
      }),
    ).then((result) => {
      assert.equal(Array.isArray(result.destinations.value), true);
      assert.equal(Array.isArray(result.properties.value), true);
      assert.equal(Array.isArray(result.members.value), true);
      assert.equal(Array.isArray(result.offices.value), true);
      assert.equal(Array.isArray(result.openHouses.value), true);
      assert.equal(Array.isArray(result.propertyReplication.value), true);
      assert.equal(Array.isArray(result.memberReplication.value), true);
      assert.equal(Array.isArray(result.officeReplication.value), true);
    }));
});

if (!hasLiveCredentials) {
  const visible =
    visibleLiveEnvNames.length > 0 ? visibleLiveEnvNames.join(", ") : "none";
  process.stdout.write(
    `Skipping live CREA/DDF tests: missing required ${missingRequiredLiveEnvNames.join(", ")}. Visible CREA live env names: ${visible}. Optional host-only URLs: CREA_DDF_BASE_URL, CREA_DDF_AUTH_URL, CREA_ANALYTICS_URL, CREA_DESTINATION_ID. CREA_DDF_BASE_URL must be the API host only, not /odata/v1.\n`,
  );
}
