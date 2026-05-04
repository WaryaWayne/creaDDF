# Open Houses

OpenHouse records represent scheduled open house events for listings.

## Endpoints

- `GET /odata/v1/OpenHouse` - list open houses.
- `GET /odata/v1/OpenHouse/{OpenHouseKey}` - get one open house.

No OpenHouse replication endpoint appeared in the OpenAPI path list.

## Query Options

List supports `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.

Single get supports `$select`.

## Identity And Links

- Primary key: `OpenHouseKey`
- Related listing keys: `ListingKey`, `ListingId`

## Fields

The OpenAPI model exposes 10 OpenHouse fields:

- `OpenHouseKey`
- `ListingKey`
- `ListingId`
- `OpenHouseDate`
- `OpenHouseStartTime`
- `OpenHouseEndTime`
- `OpenHouseRemarks`
- `OpenHouseType`
- `OpenHouseStatus`
- `LivestreamOpenHouseURL`

## SDK Methods

- `listOpenHouses(query)`
- `getOpenHouse(openHouseKey, query)`
- `syncOpenHouses(options)`

For scheduled sync, use list queries with date/status filters and stable `$orderby`. Since there is no replication endpoint, do not use the property replication strategy here.
