# Auth And Client

## Hosts

- Identity host: `https://identity.crea.ca`
- Token endpoint: `POST /connect/token`
- API host: `https://ddfapi.realtor.ca`
- OData base path: `/odata/v1`

The OpenAPI `servers` entry in the embedded model says `https://localhost:7051`, but the surrounding official docs prose and examples use `https://ddfapi.realtor.ca`. Use the public host in the SDK.

## Token Request

Request body is `application/x-www-form-urlencoded`:

```txt
grant_type=client_credentials
client_id=<destination username>
client_secret=<destination password>
scope=DDFApi_Read
```

Successful response shape:

```ts
type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: "DDFApi_Read";
};
```

The docs say `expires_in` should be 3600 seconds and the token is not sliding. Cache it, but renew before expiry.

## Request Headers

Every DDF API call needs:

```txt
Authorization: Bearer <access_token>
Accept: application/json
```

For lead creation:

```txt
Content-Type: application/json
```

## Error Handling

The docs list these status codes: `200`, `400`, `401`, `403`, `404`, `408`, `415`, `500`, and `503`.

SDK behavior should be:

- `400` - decode as bad query/key/select input where possible.
- `401` - refresh token once, then retry once.
- `403` - surface forbidden feed/permission issue.
- `404` - distinguish invalid resource URL from missing record.
- `408` and `503` - retry with bounded backoff.
- `500` - retry only if caller policy allows.

## Effect Notes

Good module split:

- `DdfAuth` service - owns token acquisition/cache.
- `DdfHttp` service - owns native Effect HTTP, retries, request construction, and error decoding.
- `DdfOData` helpers - builds query strings and follows `@odata.nextLink`.
- Resource services - Property, Member, OpenHouse, Destination, Office, and Lead.
