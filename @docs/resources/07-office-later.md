# Office Later

Office is exposed by the official OpenAPI model, but the user asked to keep it later unless metadata exposes it and the SDK needs it. Metadata/OpenAPI does expose it, so document it now and prioritize after Property, Rooms, Media, Members, OpenHouse, and Destination.

## Endpoints

- `GET /odata/v1/Office` - list offices.
- `GET /odata/v1/Office/{OfficeKey}` - get one office.
- `GET /odata/v1/Office/OfficeReplication()` - office identifiers for all destinations.
- `GET /odata/v1/Office/OfficeReplication(DestinationId={DestinationId})` - office identifiers for one destination.

## Query Options

List supports `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.

Single get supports `$select`.

Replication supports `$select`, `$count`, `$filter`, and `$orderby`.

## Fields

The Office model has 23 fields. See `../model-field-inventory.md`.

Important fields:

- `OfficeKey`
- `OfficeMlsId`
- `OfficeNationalAssociationId`
- `OfficeName`
- address and phone fields
- `OfficeAOR`
- `OfficeStatus`
- `ModificationTimestamp`
- `OriginalEntryTimestamp`
- embedded `Media`
- embedded `OfficeSocialMedia`

## SDK Methods For Later

- `listOffices(query)`
- `getOffice(officeKey, query)`
- `replicateOffices(query)`
- `replicateOfficesForDestination(destinationId, query)`
- `syncOffices(options)`

Use this when the app needs brokerage/office pages, office logos, or office-level relationship data.
