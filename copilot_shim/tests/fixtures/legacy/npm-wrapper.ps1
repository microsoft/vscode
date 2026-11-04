#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
& "node.exe" "$basedir/node_modules/@github/copilot/index.js" $args
