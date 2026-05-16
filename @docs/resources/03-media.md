# Media

Media is a documented model but not a standalone API route in the OpenAPI path list.

## API Shape

Media appears embedded on:

- `Property.Media`
- `Member.Media`
- `Office.Media`

No `/Media` endpoint appeared in the official embedded OpenAPI `paths` list, even though `Media` appears in the tag grouping and model list. Treat Media as embedded until live API evidence proves otherwise.

## Current MediaKey Behavior

The 2026-05-07 upstream release notes announce a key stability change for embedded Property, Member, and Office media:

- `MediaKey` should be treated as a string, not a numeric/bigint identifier.
- The new format is `<ObjectID>_<MediaCategoryId>_<MediaPosition>`.
- Consumers should monitor each media object's own `ModificationTimestamp` to detect photo-level changes.
- CREA expects a one-time reseeding event for Member media keys.
- If a photo is deleted and reuploaded at a different position, update all media objects for the parent because other `MediaPosition` / `Order` values can shift.

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
- `getOfficeMedia(office)`
- `normalizeMedia(parentResource, parentKey, media)`

Optional convenience methods:

- `getPrimaryPropertyPhoto(property)`
- `sortMedia(media)` - by `Order`, with preferred photo first if needed.

## Local Sync Strategy

When syncing a property or member:

1. Decode embedded `Media`.
2. Upsert by `MediaKey` when present, storing it in a string/text column.
3. Preserve `ResourceRecordKey`, `ResourceName`, and `ModificationTimestamp`.
4. For listing photos, use `Order` and `PreferredPhotoYN` for display ordering.
5. Treat Member media reseeding as a legitimate upstream change rather than a local duplicate-generation bug.
