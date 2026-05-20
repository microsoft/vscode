#---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Create a reproducible .zip archive using 7-Zip on Windows.
#
# Pre-stamps every file under -TouchDir with the committer time of HEAD
# (override via $env:SOURCE_DATE_EPOCH) so that 7-Zip embeds deterministic
# timestamps in both the DOS time and the NTFS extra field.
#
# Usage:
#   reproducible-zip.ps1 <archive.zip> <touch-dir> <7z source args...>
#
# Trailing args are passed verbatim to `7z.exe a -tzip <archive>`.
#
# Note: 7-Zip's DOS-time conversion uses Win32 APIs that follow the system
# time zone (TZ env var is ignored). Azure Pipelines Microsoft-hosted Windows
# agents are UTC by default, which is what this assumes.

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string] $ArchivePath,

	[Parameter(Mandatory = $true, Position = 1)]
	[string] $TouchDir,

	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]] $ZipArgs
)

$ErrorActionPreference = 'Stop'

if (-not $env:SOURCE_DATE_EPOCH) {
	$env:SOURCE_DATE_EPOCH = (& git log -1 --pretty=%ct).Trim()
}
$sourceDate = [DateTimeOffset]::FromUnixTimeSeconds([int64] $env:SOURCE_DATE_EPOCH).UtcDateTime

function Set-Timestamps($item) {
	try {
		$item.LastWriteTimeUtc = $sourceDate
		$item.CreationTimeUtc = $sourceDate
		$item.LastAccessTimeUtc = $sourceDate
	} catch {
		# Skip entries we cannot stamp (locked files, reparse points, etc.)
	}
}

Set-Timestamps (Get-Item -LiteralPath $TouchDir -Force)
Get-ChildItem -LiteralPath $TouchDir -Recurse -Force | ForEach-Object { Set-Timestamps $_ }

& 7z.exe a -tzip $ArchivePath @ZipArgs
exit $LASTEXITCODE
