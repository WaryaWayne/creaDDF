#!/usr/bin/env bash
set -euo pipefail

# Paste your CREA DDF destination username/password here before running.
CLIENT_ID="PASTE_CLIENT_ID_HERE"
CLIENT_SECRET="PASTE_CLIENT_SECRET_HERE"

AUTH_URL="https://identity.crea.ca/connect/token"
ODATA_BASE_URL="https://ddfapi.realtor.ca/odata/v1"
OUTPUT_FILE="src/schema/metadata.xml"

if [[ "$CLIENT_ID" == "PASTE_CLIENT_ID_HERE" || "$CLIENT_SECRET" == "PASTE_CLIENT_SECRET_HERE" ]]; then
  echo "Edit $0 and replace CLIENT_ID / CLIENT_SECRET first." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to parse the token response JSON." >&2
  exit 1
fi

TOKEN_JSON="$(
  curl -fsS -X POST "$AUTH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Accept: application/json" \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "client_secret=$CLIENT_SECRET" \
    --data-urlencode "scope=DDFApi_Read"
)"

TOKEN="$(
  printf "%s" "$TOKEN_JSON" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const json = JSON.parse(input);
      if (!json.access_token) {
        console.error("Token response did not include access_token.");
        process.exit(1);
      }
      process.stdout.write(json.access_token);
    });
  '
)"

mkdir -p "$(dirname "$OUTPUT_FILE")"

curl -fsS "${ODATA_BASE_URL%/}/\$metadata" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/xml" \
  -o "$OUTPUT_FILE"

printf "Wrote %s (%s bytes)\\n" "$OUTPUT_FILE" "$(wc -c < "$OUTPUT_FILE" | tr -d " ")"
