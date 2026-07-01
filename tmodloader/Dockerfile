# tModLoader dedicated server image
# Downloads the official tModLoader release from GitHub and runs inside tmux,
# so commands can be injected via `docker exec <container> inject <cmd>`.

FROM steamcmd/steamcmd:ubuntu-22 as builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tar \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /root/installer
RUN curl -sqL --insecure https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar zxvf -

FROM ubuntu:22.04

ARG TMOD_VERSION=v2026.04.3.0

ENV TMOD_VERSION=${TMOD_VERSION}
ENV TMOD_SHUTDOWN_MESSAGE="Server is shutting down NOW!"
ENV TMOD_AUTOSAVE_INTERVAL="10"
ENV TMOD_AUTODOWNLOAD=""
ENV TMOD_ENABLEDMODS=""
ENV TMOD_USECONFIGFILE="No"

# Default server settings (used only when the panel has not yet written serverconfig.txt)
ENV TMOD_MOTD="A tModLoader server powered by tModVision"
ENV TMOD_PASS=""
ENV TMOD_MAXPLAYERS="8"
ENV TMOD_WORLDNAME="tModWorld"
ENV TMOD_WORLDSIZE="2"
ENV TMOD_WORLDSEED=""
ENV TMOD_DIFFICULTY="0"
ENV TMOD_SECURE="0"
ENV TMOD_LANGUAGE="en-US"
ENV TMOD_NPCSTREAM="60"
ENV TMOD_UPNP="0"
ENV TMOD_PRIORITY="1"
ENV TMOD_PORT="7777"

# Copy steamcmd from builder
COPY --from=builder /root/installer/steamcmd.sh /usr/lib/games/steam/
COPY --from=builder /root/installer/linux32/steamcmd /usr/lib/games/steam/
COPY --from=builder /usr/games/steamcmd /usr/bin/steamcmd
COPY --from=builder /etc/ssl/certs /etc/ssl/certs
COPY --from=builder /lib/i386-linux-gnu /lib/
COPY --from=builder /root/installer/linux32/libstdc++.so.6 /lib/
RUN chown -R root:root /usr/bin/ /etc/ssl/certs /lib/ /usr/lib/

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      wget unzip tmux bash libsdl2-2.0-0 libicu70 curl \
 && rm -rf /var/lib/apt/lists/*

# Prepare data directories
RUN mkdir -p /data/tModLoader/Mods \
 && mkdir -p /data/tModLoader/Worlds \
 && mkdir -p /data/tModLoader/backups \
 && mkdir -p /data/steamMods

WORKDIR /terraria-server

# Prime steamcmd so first runtime is faster
RUN steamcmd /terraria-server +login anonymous +quit || true

# Use a locally provided tModLoader archive when available, otherwise download from GitHub.
COPY tModLoader.zip* ./
RUN if [ -f tModLoader.zip ]; then \
      echo "Using local tModLoader.zip"; \
    else \
      if [ "${TMOD_VERSION}" = "latest" ]; then \
        TMOD_URL="https://github.com/tModLoader/tModLoader/releases/latest/download/tModLoader.zip"; \
      else \
        TMOD_URL="https://github.com/tModLoader/tModLoader/releases/download/${TMOD_VERSION}/tModLoader.zip"; \
      fi \
      && echo "Downloading tModLoader from ${TMOD_URL}" \
      && curl -sL --fail -o tModLoader.zip "${TMOD_URL}"; \
    fi \
 && unzip -o tModLoader.zip \
 && rm tModLoader.zip

# Install bundled .NET runtime needed by tModLoader
COPY DotNetInstall.sh ./LaunchUtils/DotNetInstall.sh
RUN chmod 755 ./LaunchUtils/*.sh \
 && chmod 755 ./start-tModLoaderServer.sh \
 && ./LaunchUtils/DotNetInstall.sh

COPY entrypoint.sh .
COPY inject.sh /usr/local/bin/inject
COPY prepare-config.sh .
COPY autosave.sh .

RUN chmod 755 ./entrypoint.sh \
 && chmod 755 /usr/local/bin/inject \
 && chmod 755 ./prepare-config.sh \
 && chmod 755 ./autosave.sh

EXPOSE 7777

ENTRYPOINT ["./entrypoint.sh"]
