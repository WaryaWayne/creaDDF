# OpenAPI Path Inventory

Generated from the embedded OpenAPI model in https://ddfapi-docs.realtor.ca/ on 2026-05-04. Public API host in the docs prose is `https://ddfapi.realtor.ca`; prepend that host to the paths below.

| Method | Path | Tag | Summary | Query/path parameters |
| --- | --- | --- | --- | --- |
| GET | `/odata/v1/Destination` | Destination | Get a list of Client Destinations | $select (query), $count (query), $filter (query), $top (query), $skip (query), $orderby (query) |
| GET | `/odata/v1/Destination/{DestinationKey}` | Destination | Get a single Client Destination by DestinationId | DestinationKey (path, required), $select (query) |
| POST | `/v1/Lead/CreateLead` | Lead | Create an email lead for a Member | SuppressEmail (query) |
| GET | `/odata/v1/Member` | Member | Get a list of members | $select (query), $count (query), $filter (query), $top (query), $skip (query), $orderby (query) |
| GET | `/odata/v1/Member/{MemberKey}` | Member | Get a single member by MemberKey | MemberKey (path, required), $select (query) |
| GET | `/odata/v1/Member/MemberReplication()` | Member | Get a list of members for all destinations | $select (query), $count (query), $filter (query), $orderby (query) |
| GET | `/odata/v1/Member/MemberReplication(DestinationId={DestinationId})` | Member | Get a list of members for a single destination | DestinationId (path, required), $select (query), $count (query), $filter (query), $orderby (query) |
| GET | `/odata/v1/Office` | Office | Get a list of offices | $select (query), $count (query), $filter (query), $top (query), $skip (query), $orderby (query) |
| GET | `/odata/v1/Office/{OfficeKey}` | Office | Gets a single office by OfficeKey | OfficeKey (path, required), $select (query) |
| GET | `/odata/v1/Office/OfficeReplication()` | Office | Get a list of offices for all destinations | $select (query), $count (query), $filter (query), $orderby (query) |
| GET | `/odata/v1/Office/OfficeReplication(DestinationId={DestinationId})` | Office | Get a list of offices for a single destination | DestinationId (path, required), $select (query), $count (query), $filter (query), $orderby (query) |
| GET | `/odata/v1/OpenHouse` | OpenHouse | Get a list of open houses | $select (query), $count (query), $filter (query), $top (query), $skip (query), $orderby (query) |
| GET | `/odata/v1/OpenHouse/{OpenHouseKey}` | OpenHouse | Gets a single open house by OpenHouseKey | OpenHouseKey (path, required), $select (query) |
| GET | `/odata/v1/Property` | Property | Get a list of Properties | $select (query), $count (query), $filter (query), $top (query), $skip (query), $orderby (query) |
| GET | `/odata/v1/Property/{PropertyKey}` | Property | Get a single Property by PropertyKey | PropertyKey (path, required), $select (query) |
| GET | `/odata/v1/Property/PropertyReplication()` | Property | Get a list of properties for all destinations | $select (query), $count (query), $filter (query), $orderby (query) |
| GET | `/odata/v1/Property/PropertyReplication(DestinationId={DestinationId})` | Property | Get a list of properties for a single destination | DestinationId (path, required), $select (query), $count (query), $filter (query), $orderby (query) |
