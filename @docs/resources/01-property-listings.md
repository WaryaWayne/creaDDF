# Property Listings

Property is the main listing resource and should be the first SDK wrapper.

## Endpoints

- `GET /odata/v1/Property` - list properties.
- `GET /odata/v1/Property/{PropertyKey}` - get one property.
- `GET /odata/v1/Property/PropertyReplication()` - identifiers for all destinations.
- `GET /odata/v1/Property/PropertyReplication(DestinationId={DestinationId})` - identifiers for one destination.

The docs also describe OData function-style key lookup, for example `/odata/v1/Property('123456789')`. Prefer path-style in the SDK unless a live key requires function-style escaping.

## Query Options

List supports `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.

Single get supports `$select`.

Replication supports `$select`, `$count`, `$filter`, and `$orderby`.

## Identity

The path parameter is called `PropertyKey`, but the property model field is `ListingKey`. Treat `ListingKey` as the local primary key unless live API evidence shows a separate key.

## Embedded Children

Property includes:

- `Rooms: PropertyRoom[]`
- `Media: Media[]`

Normalize both into separate local tables if the SDK offers persistence helpers.

## Current Schema Notes

Recent upstream release notes affecting Property payloads:

- 2026-02-05 added National Association ID fields for listing agents and offices; these are present in the local schema and field inventory.
- 2025-11-26 deprecated `MapCoordinateVerifiedYN`. Prefer `GeoCodeManualYN` when it appears in live payloads/metadata, but keep decoding `MapCoordinateVerifiedYN` for backward compatibility because it is still present in the embedded OpenAPI snapshot.
- 2025-06-26 added the second and third co-listing agent and office keys.

## Fields

The OpenAPI model exposes 144 Property fields. See `../model-field-inventory.md` for the full generated list.

Important groups:

- Identity and status: `ListingKey`, `ListingId`, `StandardStatus`, `StatusChangeTimestamp`, `ModificationTimestamp`, `OriginalEntryTimestamp`.
- Pricing: `ListPrice`, `LeaseAmount`, `LeaseAmountFrequency`, `PricePerUnit`.
- Location: `UnparsedAddress`, `City`, `CityRegion`, `StateOrProvince`, `PostalCode`, `Latitude`, `Longitude`.
- Listing ownership: `ListAgentKey`, `ListOfficeKey`, `CoListAgentKey`, `CoListAgentKey2`, `CoListAgentKey3`, `CoListOfficeKey`, `CoListOfficeKey2`, `CoListOfficeKey3`, and national association IDs.
- Display permissions: `InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, `ListingURL`.
- Counts and structure: `BedroomsTotal`, `BathroomsTotalInteger`, `BuildingAreaTotal`, `LivingArea`, `Stories`, `PhotosCount`.
- Embedded: `Rooms`, `Media`.

## SDK Methods

- `listProperties(query)`
- `getProperty(propertyKey, query)`
- `replicateProperties(query)`
- `replicatePropertiesForDestination(destinationId, query)`
- `syncProperties(options)`
- `normalizePropertyGraph(property)`

`normalizePropertyGraph` should return property row, room rows, and media rows so app persistence can stay decoupled from HTTP fetching.
