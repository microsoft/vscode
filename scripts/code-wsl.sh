#!/usr/bin/env bash
set -e
HOST_IP=$(powershell.exe -Command "& {(Get-NetIPAddress | Where-Object {\$_.InterfaceAlias -like '*WSL*' -and \$_.AddressFamily -eq 'IPv4'}).IPAddress}")
DISPLAY="$HOST_IP:0" ./scripts/code.sh
