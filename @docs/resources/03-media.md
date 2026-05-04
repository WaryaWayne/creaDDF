# Media

Media is a documented model but not a standalone API route in the OpenAPI path list.

## API Shape

Media appears embedded on:

- `Property.Media`
- `Member.Media`
- `Office.Media`

No `/Media` endpoint appeared in the official embedded OpenAPI `paths` list, even though `Media` appears in the tag grouping and model list. Treat Media as embedded until live API evidence proves otherwise.

## Fields

The `Media` model has 10 fields:

- `MediaKey`
- `LongDescription`
- `MediaURL`
- `ModificationTimestamp`
- `Order`
- `PreferredPhotoYN`
- `ResourceRecordId`
- `ResourceRecordKey`
- `ResourceName`
- `MediaCategory`

`ResourceName` can indicate `Property`, `Member`, or `Office`.

## SDK Methods

Embedded helpers:

- `getPropertyMedia(property)`
- `getMemberMedia(member)`
- `getOfficeMedia(office)` later
- `normalizeMedia(parentResource, parentKey, media)`

Optional convenience methods:

- `getPrimaryPropertyPhoto(property)`
- `sortMedia(media)` - by `Order`, with preferred photo first if needed.

## Local Sync Strategy

When syncing a property or member:

1. Decode embedded `Media`.
2. Upsert by `MediaKey` when present.
3. Preserve `ResourceRecordKey` and `ResourceName`.
4. For listing photos, use `Order` and `PreferredPhotoYN` for display ordering.
