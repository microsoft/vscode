# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$logRoot = Join-Path (Get-Location) '.build/logs/integration-tests/codex-flake-repro'
New-Item -ItemType Directory -Force -Path $logRoot -ErrorAction Stop | Out-Null
$results = [System.Collections.Generic.List[object]]::new()
$selections = @(
	@{
		Name = 'reported'
		Expected = 5
		Glob = '**/{codexAgentHostE2E,codexCustomizations}.integrationTest.js'
		Pattern = '^(Agent Host E2E . Codex (retains context across consecutive turns|client-selected model is used for the turn|session changeset aggregates provider edits from default and peer chats|materialized provider exposes its supported management artifacts)|Agent Host Provider Integration . Codex Customizations workspace SessionStart hook obeys Workspace Trust \(trusted\))$'
	},
	@{
		Name = 'cold-model'
		Expected = 1
		Glob = '**/e2e/providers/codexAgentHostE2E.integrationTest.js'
		Pattern = '^Agent Host E2E . Codex client-selected model is used for the turn$'
	}
)

Write-Host "Source: $(git rev-parse HEAD)"
Write-Host "Codex: $(node -p "JSON.parse(require('fs').readFileSync('node_modules/@openai/codex/package.json','utf8')).version")"
Write-Host 'Each selection starts a fresh Electron test process. Test timeouts and assertions are unchanged.'

for ($iteration = 1; $iteration -le 40; $iteration++) {
	foreach ($selection in $selections) {
		$name = '{0}-{1:D2}' -f $selection.Name, $iteration
		$arguments = @('--build', '--runGlob', $selection.Glob, '--grep', $selection.Pattern, '--reporter', 'spec')
		$watch = [System.Diagnostics.Stopwatch]::StartNew()
		$output = & .\scripts\test-integration.bat @arguments 2>&1
		$exitCode = $LASTEXITCODE
		$watch.Stop()
		$text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
		[System.IO.File]::WriteAllText((Join-Path $logRoot "$name.log"), $text)
		$plain = [regex]::Replace($text, '\x1B\[[0-?]*[ -/]*[@-~]', '')
		$passing = [regex]::Match($plain, '(?m)^\s*(\d+) passing\b')
		$failing = [regex]::Match($plain, '(?m)^\s*(\d+) failing\b')
		$pending = [regex]::Match($plain, '(?m)^\s*(\d+) pending\b')
		$passed = $exitCode -eq 0 -and $passing.Success -and [int]$passing.Groups[1].Value -eq $selection.Expected -and !$failing.Success -and !$pending.Success
		$record = [pscustomobject]@{
			Selection = $selection.Name
			Iteration = $iteration
			ExitCode = $exitCode
			Passed = $passed
			Passing = $(if ($passing.Success) { [int]$passing.Groups[1].Value } else { $null })
			Failing = $(if ($failing.Success) { [int]$failing.Groups[1].Value } else { 0 })
			Pending = $(if ($pending.Success) { [int]$pending.Groups[1].Value } else { 0 })
			Seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2)
			Log = "$name.log"
		}
		$results.Add($record)
		$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $logRoot 'results.json') -Encoding utf8
		Write-Host ($record | ConvertTo-Json -Compress)
		if (!$passed) {
			Write-Host (($plain -split '\r?\n' | Select-Object -Last 100) -join [Environment]::NewLine)
		}
	}
}

$failures = @($results | Where-Object { !$_.Passed })
Write-Host "Completed $($results.Count) invocations; $($failures.Count) failed or did not execute the exact expected test count."
if ($failures.Count -gt 0) { exit 1 }
