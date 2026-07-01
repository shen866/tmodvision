#!/bin/sh
# Autosave the world at the configured interval.
while true; do
  sleep "${TMOD_AUTOSAVE_INTERVAL}m"
  echo "[SYSTEM] Auto-saving world..."
  tmux send-keys -t tmodloader "save" Enter
  tmux send-keys -t tmodloader "say The world has been saved." Enter
done
