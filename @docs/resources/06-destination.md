# Destination

Destination exists in the API and should be wrapped because it matters for feed context and technology-provider accounts.

## Endpoints

- `GET /odata/v1/Destination` - list client destinations.
- `GET /odata/v1/Destination/{DestinationKey}` - get one destination by `DestinationId`.

The docs also describe OData function-style lookup, for example `/odata/v1/Destination(1301)`. Prefer path-style in SDK calls.

## Query Options

List supports `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.

Single get supports `$select`.

## Fields

The Destination model has 11 fields:

- `DestinationId`
- `DestinationName`
- `DestinationUrl`
- `DestinationType`
- `DestinationStatus`
- `MemberFirstName`
- `MemberLastName`
- `MemberKey`
- `OriginalEntryTimestamp`
- `ModificationTimestamp`
- `FullNSP`

## SDK Methods

- `listDestinations(query)`
- `getDestination(destinationId, query)`

## How It Connects To Replication

Technology-provider accounts can use destination-specific replication endpoints:

- `/odata/v1/Property/PropertyReplication(DestinationId={DestinationId})`
- `/odata/v1/Member/MemberReplication(DestinationId={DestinationId})`
- `/odata/v1/Office/OfficeReplication(DestinationId={DestinationId})`

The SDK should accept `destinationId` in replication options without requiring it for normal destination credentials.
