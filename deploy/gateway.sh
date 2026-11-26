#!/bin/sh
set -eu
# Certbot runs separately; the gateway alone owns and reloads nginx.
(
  last=''
  while sleep 30; do
    marker=$(cat /var/www/acme/renewed 2>/dev/null || true)
    if [ -n "$marker" ] && [ "$marker" != "$last" ]; then
      nginx -t && nginx -s reload && last=$marker
    fi
  done
) &
exec nginx -g 'daemon off; worker_shutdown_timeout 15s;'
