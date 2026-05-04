# Members

Member represents agents and brokers.

## Endpoints

- `GET /odata/v1/Member` - list members.
- `GET /odata/v1/Member/{MemberKey}` - get one member.
- `GET /odata/v1/Member/MemberReplication()` - member identifiers for all destinations.
- `GET /odata/v1/Member/MemberReplication(DestinationId={DestinationId})` - member identifiers for one destination.

## Query Options

List supports `$select`, `$count`, `$filter`, `$top`, `$skip`, and `$orderby`.

Single get supports `$select`.

Replication supports `$select`, `$count`, `$filter`, and `$orderby`.

## Identity

Use `MemberKey` as the primary key.

## Fields

The OpenAPI model exposes 34 Member fields. See `../model-field-inventory.md`.

Important groups:

- Identity: `MemberKey`, `MemberMlsId`, `MemberNationalAssociationId`.
- Office links: `OfficeKey`, `OfficeNationalAssociationId`.
- Name: `MemberFirstName`, `MemberLastName`, prefixes/suffixes/middle/nickname.
- Contact: `MemberOfficePhone`, `MemberOfficePhoneExt`, `MemberTollFreePhone`, `MemberFax`, `MemberEmailYN`.
- Address: `MemberAddress1`, `MemberAddress2`, `MemberCity`, `MemberStateOrProvince`, `MemberPostalCode`, `MemberCountry`.
- Metadata: `MemberAOR`, `MemberAORKey`, `MemberStatus`, `MemberType`, `ModificationTimestamp`, `OriginalEntryTimestamp`.
- Embedded: `MemberSocialMedia`, `Media`.

## SDK Methods

- `listMembers(query)`
- `getMember(memberKey, query)`
- `replicateMembers(query)`
- `replicateMembersForDestination(destinationId, query)`
- `syncMembers(options)`

For app display, members can be lazily hydrated from property `ListAgentKey` and co-list agent keys.
