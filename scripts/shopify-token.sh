#!/usr/bin/env bash
# Returns a usable Shopify Admin API access token, printed to stdout.
#
# Caches the token in src/.shopify-token.json (gitignored) with its expiry and
# REUSES it until ~expired, minting a fresh one (client_credentials grant, reads
# client_id/client_secret from src/.env) only when the cache is missing/stale.
# Tokens are short-lived (~24h); the cache handles re-minting transparently.
#
# Usage:   TOKEN="$(scripts/shopify-token.sh)"
#          curl -H "X-Shopify-Access-Token: $TOKEN" ...
set -euo pipefail

STORE="awesome-store-1234637.myshopify.com"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/src/.env"
CACHE="$ROOT/src/.shopify-token.json"

# 1. Reuse cached token if still valid (60s safety buffer).
if [ -f "$CACHE" ]; then
  cached="$(python3 -c 'import sys,json,time
try:
    d=json.load(open(sys.argv[1]))
    if d.get("expires_at",0)-60 > time.time(): print(d["access_token"],end="")
except Exception: pass' "$CACHE")"
  [ -n "$cached" ] && { printf '%s' "$cached"; exit 0; }
fi

# 2. Otherwise mint a fresh one and cache it with computed expiry.
[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }
read_kv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"'; }
CLIENT_ID="$(read_kv client_id)"; CLIENT_SECRET="$(read_kv client_secret)"
[ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || { echo "client_id/client_secret missing in $ENV_FILE" >&2; exit 1; }

resp="$(curl -sS -X POST "https://$STORE/admin/oauth/access_token" \
  -d grant_type=client_credentials -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET")"

token="$(printf '%s' "$resp" | python3 -c 'import sys,json,time
try:
    d=json.load(sys.stdin); t=d.get("access_token","")
    if t:
        json.dump({"access_token":t,"expires_at":int(time.time())+int(d.get("expires_in",86400))}, open(sys.argv[1],"w"))
        print(t,end="")
except Exception: pass' "$CACHE")"

[ -n "$token" ] || { echo "failed to mint token; response: $resp" >&2; exit 1; }
printf '%s' "$token"
