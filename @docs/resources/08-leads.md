# Leads

Lead creation exists in the OpenAPI definition, but it is not a data replication resource.

## Endpoint

- `POST /v1/Lead/CreateLead`

Query parameter:

- `SuppressEmail?: boolean` - when true, suppresses sending an email to the Realtor.

Request body is JSON using `DDF.Core.Models.LeadModel`.

## LeadModel Fields

- `Culture: string`
- `MemberKey: string`
- `ListingKey: string`
- `SenderName: string`
- `SenderEmailAddress: string`
- `SenderPhoneNumber?: integer | null`
- `PreferredMethodContact: string`
- `SenderPhoneExtension?: integer | null`
- `Message: string`

## LeadResponse Fields

- `details?: string | null`
- `message?: string | null`
- `code?: string | null`
- `success: boolean`

## SDK Method

- `createLead(input, options?: { suppressEmail?: boolean })`

Keep this out of replication services. It belongs in a separate `LeadService` or optional module.
