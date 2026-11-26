#!/usr/bin/env bash
# Install the runtime requested by this particular release into its launcher's layout.
set -euo pipefail
cd /terraria-server
version=$(sed -n 's/^.*"version": *"\([0-9.]*\)".*/\1/p' tModLoader.runtimeconfig.json)
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
runtime_dir="$PWD/dotnet"
if [[ ! -f LaunchUtils/InstallDotNet.sh ]]; then
  runtime_dir="$runtime_dir/$version"
fi
mkdir -p "$runtime_dir"
curl -fLsS --retry 3 "https://dotnetcli.blob.core.windows.net/dotnet/Runtime/$version/dotnet-runtime-$version-linux-x64.tar.gz" | tar -xz -C "$runtime_dir"
"$runtime_dir/dotnet" --list-runtimes | grep -F "Microsoft.NETCore.App $version "
