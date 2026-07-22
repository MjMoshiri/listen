#!/usr/bin/env bash
# Expose the local app at https://listen.mjmoshiri.com on demand via a
# Cloudflare tunnel. Idempotent: creates the tunnel + DNS record on first run,
# afterwards it just connects. Ctrl-C to go offline again.
#
# One-time prerequisite (browser auth against the Cloudflare account that
# holds mjmoshiri.com):   cloudflared tunnel login
set -euo pipefail

HOST=listen.mjmoshiri.com
TUNNEL=listen
PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared not installed (brew install cloudflared)" >&2
  exit 1
fi

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  cat >&2 <<'EOF'
One-time setup needed — authorize cloudflared with your Cloudflare account:

    cloudflared tunnel login

(a browser opens; pick the mjmoshiri.com zone), then re-run this script.
EOF
  exit 1
fi

if ! cloudflared tunnel info "$TUNNEL" >/dev/null 2>&1; then
  echo "Creating tunnel '$TUNNEL'…"
  cloudflared tunnel create "$TUNNEL"
fi

# Points $HOST at the tunnel; errors harmlessly if the record already exists
cloudflared tunnel route dns "$TUNNEL" "$HOST" 2>/dev/null \
  || echo "(DNS route for $HOST already in place)"

KEY=$(grep -s '^LISTEN_ACCESS_KEY=' "$(dirname "$0")/../.env" | cut -d= -f2- || true)
echo
echo "  https://$HOST  →  http://localhost:$PORT"
[ -n "$KEY" ] && echo "  first visit per device: https://$HOST/?key=$KEY"
echo
exec cloudflared tunnel run --url "http://localhost:$PORT" "$TUNNEL"
