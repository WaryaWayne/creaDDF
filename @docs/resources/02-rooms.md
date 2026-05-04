# Rooms

Rooms are part of Property listings, not a standalone OpenAPI path.

## API Shape

The Property model includes:

```ts
Rooms?: PropertyRoom[] | null
```

No `/Room`, `/Rooms`, or `/PropertyRoom` endpoint appeared in the embedded OpenAPI path list fetched from the docs.

## Fields

The `PropertyRoom` model has 11 fields:

- `RoomKey`
- `ListingId`
- `ListingKey`
- `ModificationTimestamp`
- `RoomDescription`
- `RoomDimensions`
- `RoomLength`
- `RoomLevel`
- `RoomWidth`
- `RoomLengthWidthUnits`
- `RoomType`

See `../model-field-inventory.md` for types and descriptions.

## SDK Methods

Do not build HTTP methods for Rooms unless live docs expose a route later.

Build embedded helpers:

- `getPropertyRooms(property)`
- `normalizePropertyRooms(property)`
- `replaceRoomsForProperty(listingKey, rooms)` if persistence hooks are included.

## Local Sync Strategy

When a property is hydrated:

1. Decode `Property.Rooms`.
2. Upsert room rows keyed by `RoomKey` when present.
3. Include `ListingKey` as the parent key.
4. If replacing the child set, delete local rooms for that listing that are no longer present in the latest hydrated property payload.
