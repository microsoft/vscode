#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#---------------------------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent (Resolve-Path $MyInvocation.MyCommand.Path))
$ELTRON = "$ROOT\\node_modules\\electron\\dist\\electron"

Set-Location $ROOT
& $ELTRON ./script/electron/simulationWorkbenchMain.js $args