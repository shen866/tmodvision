#!/bin/bash
set -e

pipe=/tmp/tmod.pipe
configPath=/terraria-server/serverconfig.txt

# Ensure data dirs exist
mkdir -p /data/tModLoader/Mods
mkdir -p /data/tModLoader/Worlds
mkdir -p /data/tModLoader/backups
mkdir -p /data/steamMods

# Prepare or reuse serverconfig.txt
if [ -f /data/tModLoader/serverconfig.txt ]; then
  echo "[SYSTEM] Using serverconfig.txt managed by tModVision panel."
  configPath=/data/tModLoader/serverconfig.txt
elif [ "$TMOD_USECONFIGFILE" = "Yes" ] && [ -f /terraria-server/customconfig.txt ]; then
  echo "[SYSTEM] Using custom config file /terraria-server/customconfig.txt."
  cp /terraria-server/customconfig.txt "$configPath"
else
  echo "[SYSTEM] Preparing default serverconfig.txt from environment variables."
  ./prepare-config.sh
fi

# Optional: download workshop mods on startup (legacy compatibility)
if [ -n "$TMOD_AUTODOWNLOAD" ]; then
  echo "[SYSTEM] Downloading workshop mods: $TMOD_AUTODOWNLOAD"
  steamcmd +force_install_dir /data/steamMods +login anonymous \
    $(echo "$TMOD_AUTODOWNLOAD" | sed 's/,/ /g' | sed 's/[^ ]*/+workshop_download_item 1281930 &/g') \
    +quit
  echo "[SYSTEM] Workshop download finished."
fi

# Optional: enable mods from workshop IDs (legacy compatibility)
if [ -n "$TMOD_ENABLEDMODS" ]; then
  enabledpath=/data/tModLoader/Mods/enabled.json
  modpath=/data/steamMods/steamapps/workshop/content/1281930
  rm -f "$enabledpath"
  touch "$enabledpath"
  echo '[' >> "$enabledpath"
  echo "$TMOD_ENABLEDMODS" | tr ',' '\n' | while read LINE; do
    [ -z "$LINE" ] && continue
    moddir=$(find "$modpath/$LINE" -maxdepth 2 -type f -name "*.tmod" 2>/dev/null | head -n 1)
    if [ -z "$moddir" ]; then
      echo "[WARNING] Could not resolve mod $LINE"
      continue
    fi
    modname=$(basename "$moddir" .tmod)
    echo "\"$modname\"," >> "$enabledpath"
    echo "[SYSTEM] Enabled $modname ($LINE)"
  done
  # Remove trailing comma from last entry to keep JSON valid
  sed -i '$ { s/,$// }' "$enabledpath"
  echo ']' >> "$enabledpath"
fi

# Graceful shutdown
cleanup() {
  echo "[SYSTEM] Received shutdown signal, stopping tModLoader gracefully..."
  inject "say $TMOD_SHUTDOWN_MESSAGE" || true
  sleep 3
  inject "exit" || true
  tmuxPid=$(pgrep tmux || true)
  if [ -n "$tmuxPid" ]; then
    tmodPid=$(pgrep --oldest --parent "$tmuxPid" || true)
    if [ -n "$tmodPid" ]; then
      while [ -e "/proc/$tmodPid" ]; do
        sleep 0.5
      done
    fi
  fi
  rm -f "$pipe"
  exit 0
}

trap cleanup TERM INT

# Build server launch command
server="/terraria-server/LaunchUtils/ScriptCaller.sh -server \
  -tmlsavedirectory /data/tModLoader \
  -steamworkshopfolder /data/steamMods/steamapps/workshop \
  -config \"$configPath\""

# Create pipe for container logs
rm -f "$pipe"
mkfifo "$pipe"

# Start tModLoader in a tmux session named "tmodloader"
tmux new-session -d -s tmodloader "$server | tee $pipe"

# Start autosave loop in background
/terraria-server/autosave.sh &

# Stream logs to stdout so Docker can capture them
cat "$pipe" &
wait ${!}
