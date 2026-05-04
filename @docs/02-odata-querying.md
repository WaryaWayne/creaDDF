# OData Querying

The DDF Web API is built on OData. The published list endpoints support these query options:

- `$select` - include only selected fields.
- `$count` - include total count. The docs warn there is a performance cost.
- `$filter` - boolean filter expression.
- `$top` - return the first `n` rows.
- `$skip` - skip the first `n` rows.
- `$orderby` - sort results.

Single-record endpoints support:

- `$select`

Replication endpoints support:

- `$select`
- `$count`
- `$filter`
- `$orderby`

## Pagination

Default page size is 20 records. `$top` can increase page size up to 100 records.

If another page exists, the response includes `@odata.nextLink`. The SDK should follow the URL exactly instead of reconstructing `$skip` manually.

Important: the docs warn there is no guaranteed order while paginating. Always set `$orderby`, especially for large reads.

Suggested default ordering:

- Property list: `ListingKey asc` or `ModificationTimestamp asc,ListingKey asc`
- Member list: `MemberKey asc` or `ModificationTimestamp asc,MemberKey asc`
- OpenHouse list: `OpenHouseKey asc` or `OpenHouseDate asc,OpenHouseKey asc`
- Destination list: `DestinationId asc`

## Filters

The docs show timestamp filtering against replication:

```txt
$filter=ModificationTimestamp gt 2024-01-25T00:00:00.00Z
```

The SDK should not try to invent a full OData expression builder on night one. Start with:

- pass-through `filter: string`
- small helpers for common predicates, such as `modifiedAfter(field, date)`
- strict URL encoding

## Query Builder Scope

Build a small OData query encoder, not a giant typed DSL for every DDF field.

Good first surface:

```ts
type ODataQuery = {
  select?: ReadonlyArray<string>
  count?: boolean
  filter?: string
  top?: number
  skip?: number
  orderby?: string | ReadonlyArray<string>
}
```

The encoder should:

- Preserve `$` query parameter names.
- URL encode values correctly.
- Join `$select` fields with commas.
- Join array `$orderby` values with commas.
- Reject invalid `$top` values above the API maximum of `100`.
- Follow `@odata.nextLink` exactly after the first request.

Add lightweight helper functions only where they remove real footguns:

```ts
filters.modifiedAfter("ModificationTimestamp", date)
filters.eq("StandardStatus", "Active")
filters.and(a, b)
filters.or(a, b)
```

The SDK can always accept raw `filter` strings for advanced DDF/OData cases. This keeps the helper library flexible without spending the first build on every possible search combination.

## Response Envelope

List responses use:

```ts
type ODataListResponse<T> = {
  "@odata.context"?: string | null
  value?: T[] | null
  "@odata.nextLink"?: string | null
  "@odata.count"?: number
}
```

Single responses are an OData object envelope in the OpenAPI model. Validate against live responses before overfitting the schema, because many OData APIs return the entity directly with `@odata.context`.
