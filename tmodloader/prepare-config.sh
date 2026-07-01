#!/bin/bash
# Generate a default serverconfig.txt from environment variables.
# This is only used before the tModVision panel writes its own config.

configPath=/terraria-server/serverconfig.txt
rm -f "$configPath"

echo "world=/data/tModLoader/Worlds/${TMOD_WORLDNAME}.wld" >> "$configPath"
echo "worldpath=/data/tModLoader/Worlds/" >> "$configPath"
echo "worldname=${TMOD_WORLDNAME}" >> "$configPath"
echo "autocreate=${TMOD_WORLDSIZE}" >> "$configPath"
if [ -n "$TMOD_WORLDSEED" ]; then
  echo "seed=${TMOD_WORLDSEED}" >> "$configPath"
fi
[ -n "$TMOD_PASS" ] && echo "password=${TMOD_PASS}" >> "$configPath"

echo "motd=${TMOD_MOTD}" >> "$configPath"
echo "maxplayers=${TMOD_MAXPLAYERS}" >> "$configPath"
echo "difficulty=${TMOD_DIFFICULTY}" >> "$configPath"
echo "secure=${TMOD_SECURE}" >> "$configPath"
echo "language=${TMOD_LANGUAGE}" >> "$configPath"
echo "npcstream=${TMOD_NPCSTREAM}" >> "$configPath"
echo "upnp=${TMOD_UPNP}" >> "$configPath"
echo "priority=${TMOD_PRIORITY}" >> "$configPath"
echo "port=${TMOD_PORT}" >> "$configPath"

echo "[CONFIG] Generated default serverconfig.txt"
