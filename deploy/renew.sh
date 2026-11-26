#!/bin/sh
set -u
while true; do
  if certbot renew --cert-name "$PANEL_CERT_NAME" --non-interactive --no-random-sleep-on-renew --deploy-hook 'date -u +%s > /var/www/acme/renewed'; then
    result=OK
  else
    result=FAILED
  fi
  echo "$(date -u +%FT%TZ) $result" > /var/www/acme/renew-status
  sleep 21600
done
