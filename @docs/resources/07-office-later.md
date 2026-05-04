# Office

Office is exposed by the official OpenAPI model and metadata. Implement it after Property, Rooms, Media, Members, OpenHouse, and Destination so the SDK has broad method coverage.

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

## SDK Methods

- `listOffices(query)`
- `getOffice(officeKey, query)`
- `replicateOffices(query)`
- `replicateOfficesForDestination(destinationId, query)`
- `syncOffices(options)`

Use this for brokerage/office pages, office logos, office-level relationship data, and complete DDF API coverage.
