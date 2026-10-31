/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

const pipelineRoot = path.resolve(import.meta.dirname, '../../azure-pipelines');
const collector = path.join(pipelineRoot, 'win32/collect-network-diagnostics.ps1');
const timeoutHelper = path.join(pipelineRoot, 'common/runWithTimeout.ts');
const secret = 'DO_NOT_ARCHIVE_CREDENTIAL_OR_FREE_FORM_CONTENT';
const quotePowerShell = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`;

interface DiagnosticSection {
	status: string;
	reason?: string;
	errorType?: string;
	data: {
		truncated: boolean;
		processes?: { processId: number; startedAt: string }[];
		endpoints?: { address: string; port: number; processId: number }[];
		listeners?: { address: string; port: number; processId: number }[];
		events?: { eventId: number; clientProcessId?: string; queryStatus?: string; processId?: string; exceptionCode?: string }[];
		files?: { name: string; bytes: number }[];
		contentsCollected?: boolean;
	};
}

interface Capture {
	completed: boolean;
	context: Record<string, string | null>;
	unavailableSections?: string[];
}

// These functions only replace commands in the isolated child PowerShell process.
const fakeCommands = `
function Get-Process {
	[CmdletBinding()] param()
	if ($env:DIAGNOSTIC_SCENARIO -eq 'empty') { return }
	$count = if ($env:DIAGNOSTIC_SCENARIO -eq 'limits') { 70 } else { 1 }
	1..$count | ForEach-Object {
		[pscustomobject]@{ ProcessName = 'EtwNetworkEventListener'; Id = 8060 + $_; StartTime = [DateTime]'2026-08-24T08:05:06Z'; CommandLine = $env:AZURE_DEVOPS_EXT_PAT }
	}
}
function Get-DnsClientServerAddress {
	[CmdletBinding()] param()
	if ($env:DIAGNOSTIC_SCENARIO -eq 'hang') { Start-Sleep -Seconds 60 }
	$count = if ($env:DIAGNOSTIC_SCENARIO -eq 'oversize') { 64 } else { 1 }
	$addresses = if ($count -eq 64) { @('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') * 64 } else { @('127.0.0.1', '10.0.4.10') }
	1..$count | ForEach-Object {
		[pscustomobject]@{ InterfaceIndex = $_; AddressFamily = 2; ServerAddresses = $addresses; InterfaceAlias = $env:AZURE_DEVOPS_EXT_PAT }
	}
}
function Get-NetUDPEndpoint {
	[CmdletBinding()] param()
	if ($env:DIAGNOSTIC_SCENARIO -eq 'unavailable') { throw [System.UnauthorizedAccessException]::new($env:AZURE_DEVOPS_EXT_PAT) }
	[pscustomobject]@{ LocalPort = 53; LocalAddress = '127.0.0.1'; OwningProcess = 8061 }
	[pscustomobject]@{ LocalPort = 123; LocalAddress = '0.0.0.0'; OwningProcess = 1 }
}
function Get-NetTCPConnection {
	[CmdletBinding()] param()
	[pscustomobject]@{ LocalPort = 53; LocalAddress = '::1'; OwningProcess = 8061; State = 'Listen' }
	[pscustomobject]@{ LocalPort = 53; LocalAddress = '::1'; OwningProcess = 10; State = 'Established' }
}
function Get-WinEvent {
	[CmdletBinding()] param([string]$ListLog, [string]$LogName, [string]$FilterXPath, [int]$MaxEvents)
	if ($ListLog) {
		return [pscustomobject]@{ IsEnabled = -not ($env:DIAGNOSTIC_SCENARIO -eq 'unavailable' -and $ListLog -eq 'Microsoft-Windows-DNS-Client/Operational') }
	}
	if ($FilterXPath -notlike '*timediff(@SystemTime) <= 3600000*' -or $MaxEvents -ne 65) { throw 'Missing event bounds' }
	if ($env:DIAGNOSTIC_SCENARIO -eq 'empty') {
		Write-Error -ErrorId NoMatchingEventsFound -Category ObjectNotFound -Message 'No matching events' -ErrorAction Stop
	}
	if ($LogName -eq 'Application') {
		if (-not $FilterXPath.Contains("Data[@Name='AppName']='EtwNetworkEventListener.exe'")) { throw 'Missing listener filter' }
		$id = 1000
		$data = '<Data Name="AppName">EtwNetworkEventListener.exe</Data><Data Name="ProcessId">0x1f7d</Data><Data Name="ExceptionCode">c0000005</Data>'
	} else {
		if (-not $FilterXPath.Contains("Data[@Name='QueryName']='vsblob.dev.azure.com'")) { throw 'Missing DNS filter' }
		$id = if ($LogName -eq 'System') { 1014 } else { 3008 }
		$data = '<Data Name="QueryName">vsblob.dev.azure.com</Data><Data Name="ClientPID">90</Data><Data Name="QueryType">1</Data><Data Name="QueryStatus">11001</Data>'
	}
	$xml = '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><EventData>' + $data + '<Data Name="QueryResults">' + $env:AZURE_DEVOPS_EXT_PAT + '</Data></EventData></Event>'
	[pscustomobject]@{ Id = $id; RecordId = 123; TimeCreated = [DateTime]'2026-08-24T08:26:13Z'; Xml = $xml; Message = $env:AZURE_DEVOPS_EXT_PAT } |
		Add-Member -MemberType ScriptMethod -Name ToXml -Value { $this.Xml } -PassThru
}
`;

function fixture(scenario: string) {
	const root = mkdtempSync(path.join(tmpdir(), 'vscode-network-diagnostics-'));
	const output = path.join(root, 'output with spaces');
	const localAppData = path.join(root, 'local');
	const logs = path.join(localAppData, 'Temp/NetworkIsolation/Logs');
	mkdirSync(logs, { recursive: true });
	writeFileSync(path.join(logs, 'listener.log'), secret);
	writeFileSync(path.join(path.dirname(logs), 'EtwListenerEnvironmentVariables.json'), secret);
	if (scenario === 'limits') {
		for (let index = 0; index < 70; index++) {
			writeFileSync(path.join(logs, `listener-${index}.log`), secret);
		}
	}
	if (scenario === 'unavailable') {
		rmSync(logs, { recursive: true });
	}
	const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `${fakeCommands}\n& ${quotePowerShell(collector)} -OutputDirectory ${quotePowerShell(output)}`];
	const env = { ...process.env, LOCALAPPDATA: localAppData, DIAGNOSTIC_SCENARIO: scenario, AZURE_DEVOPS_EXT_PAT: secret, BUILD_BUILDID: '467068' };
	return {
		root,
		output,
		run: () => spawnSync('powershell.exe', args, { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 256 * 1024 }),
		runWithDeadline: () => spawnSync(process.execPath, [timeoutHelper, '5', '--', 'powershell.exe', ...args], { env, encoding: 'utf8', timeout: 15_000, maxBuffer: 256 * 1024 }),
		section: (name: string) => JSON.parse(readFileSync(path.join(output, `${name}.json`), 'utf8')) as DiagnosticSection,
		capture: () => JSON.parse(readFileSync(path.join(output, 'capture.json'), 'utf8')) as Capture,
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}

suite('Windows network failure diagnostics', { skip: process.platform !== 'win32' }, () => {
	test('captures projected evidence without command lines, messages, credentials or raw logs', () => {
		const f = fixture('complete');
		try {
			const result = f.run();
			assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
			assert.deepStrictEqual({
				completed: f.capture().completed,
				buildId: f.capture().context.BUILD_BUILDID,
				unavailable: f.capture().unavailableSections,
				listener: f.section('listener').data.processes,
				udp: f.section('dns-udp-endpoints').data.endpoints,
				tcp: f.section('dns-tcp-listeners').data.listeners,
				crash: f.section('listener-crashes').data.events?.map(event => [event.eventId, event.processId, event.exceptionCode]),
				dns: f.section('dns-query-results').data.events?.map(event => [event.eventId, event.clientProcessId, event.queryStatus]),
				copiedLogs: f.section('listener-log-inventory').data.contentsCollected,
			}, {
				completed: true,
				buildId: '467068',
				unavailable: [],
				listener: [{ processId: 8061, startedAt: '2026-08-24T08:05:06.0000000Z' }],
				udp: [{ address: '127.0.0.1', port: 53, processId: 8061 }],
				tcp: [{ address: '::1', port: 53, processId: 8061 }],
				crash: [[1000, '0x1f7d', 'c0000005']],
				dns: [[3008, '90', '11001']],
				copiedLogs: false,
			});
			const contents = readdirSync(f.output).map(file => readFileSync(path.join(f.output, file), 'utf8')).join('\n');
			assert.ok(!`${contents}\n${result.stdout}\n${result.stderr}`.includes(secret));
			assert.deepStrictEqual(readdirSync(f.output).sort(), [
				'capture.json', 'dns-query-results.json', 'dns-servers.json', 'dns-tcp-listeners.json', 'dns-timeouts.json',
				'dns-udp-endpoints.json', 'listener-crashes.json', 'listener-log-inventory.json', 'listener.json',
			]);
		} finally {
			f.dispose();
		}
	});

	test('distinguishes absent processes and no matching events from collection failures', () => {
		const f = fixture('empty');
		try {
			const result = f.run();
			assert.deepStrictEqual({ status: result.status, unavailable: f.capture().unavailableSections, processes: f.section('listener').data.processes, events: f.section('listener-crashes').data.events }, {
				status: 0, unavailable: [], processes: [], events: [],
			});
		} finally {
			f.dispose();
		}
	});

	test('reports inaccessible, disabled and missing sources without losing later sections or printing error messages', () => {
		const f = fixture('unavailable');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status,
				completed: f.capture().completed,
				unavailable: f.capture().unavailableSections,
				udp: f.section('dns-udp-endpoints').status,
				udpReason: f.section('dns-udp-endpoints').reason,
				tcp: f.section('dns-tcp-listeners').status,
				operational: f.section('dns-query-results').status,
				operationalReason: f.section('dns-query-results').reason,
				logs: f.section('listener-log-inventory').status,
				leaked: `${result.stdout}\n${result.stderr}\n${readFileSync(path.join(f.output, 'dns-udp-endpoints.json'), 'utf8')}`.includes(secret),
			}, {
				status: 1, completed: true, unavailable: ['dns-udp-endpoints', 'dns-query-results', 'listener-log-inventory'],
				udp: 'unavailable', udpReason: 'accessDenied', tcp: 'complete',
				operational: 'unavailable', operationalReason: 'channelDisabled', logs: 'unavailable', leaked: false,
			});
			assert.match(result.stdout, /##vso\[task.logissue type=warning\]/);
		} finally {
			f.dispose();
		}
	});

	test('bounds records and explicitly reports truncation', () => {
		const f = fixture('limits');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status, processes: f.section('listener').data.processes?.length, listenerTruncated: f.section('listener').data.truncated,
				logs: f.section('listener-log-inventory').data.files?.length, logsTruncated: f.section('listener-log-inventory').data.truncated,
			}, { status: 0, processes: 64, listenerTruncated: true, logs: 64, logsTruncated: true });
		} finally {
			f.dispose();
		}
	});

	test('rejects oversized JSON without losing other evidence', () => {
		const f = fixture('oversize');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status, dns: f.section('dns-servers').status, reason: f.section('dns-servers').reason, unavailable: f.capture().unavailableSections,
				bounded: readdirSync(f.output).every(file => statSync(path.join(f.output, file)).size <= 65536),
			}, { status: 1, dns: 'unavailable', reason: 'outputLimitExceeded', unavailable: ['dns-servers'], bounded: true });
		} finally {
			f.dispose();
		}
	});

	test('keeps current evidence but not stale sections when a query hangs', () => {
		const f = fixture('hang');
		try {
			mkdirSync(f.output);
			writeFileSync(path.join(f.output, 'dns-query-results.json'), JSON.stringify({ status: 'complete', data: secret }));
			const result = f.runWithDeadline();
			assert.deepStrictEqual({
				status: result.status, completed: f.capture().completed,
				listenerWritten: existsSync(path.join(f.output, 'listener.json')),
				unfinishedSection: f.section('dns-servers').status,
				staleSection: f.section('dns-query-results').status,
			}, { status: 124, completed: false, listenerWritten: true, unfinishedSection: 'notCollected', staleSection: 'notCollected' });
			assert.match(result.stdout, /did not finish within 5 s/);
		} finally {
			f.dispose();
		}
	});

	test('fails before announcing an artifact when the output path is a file', () => {
		const f = fixture('complete');
		try {
			writeFileSync(f.output, 'not a directory');
			const result = f.run();
			assert.deepStrictEqual({ status: result.status, announced: result.stdout.includes('VSCODE_NETWORK_DIAGNOSTICS_CAPTURED') }, { status: 1, announced: false });
		} finally {
			f.dispose();
		}
	});
});

interface PipelineStep {
	displayName?: string;
	condition?: string;
	continueOnError?: boolean;
	timeoutInMinutes?: number;
	pwsh?: string;
}

interface PipelineOutput {
	targetPath: string;
	artifactName: string;
	condition?: string;
	isProduction?: boolean;
}

function readPipeline(file: string) {
	return load(readFileSync(path.join(pipelineRoot, file), 'utf8')) as {
		steps: PipelineStep[];
		jobs: { templateContext: { outputs: PipelineOutput[] } }[];
	};
}

suite('Windows network diagnostic templates', () => {
	test('collects immediately after Build client, only on failure, with bounded and non-fatal execution', () => {
		const steps = readPipeline('win32/steps/product-build-win32-compile.yml').steps;
		const index = steps.findIndex(step => step.displayName === 'Build client');
		assert.ok(index >= 0);
		assert.deepStrictEqual(steps[index + 1], {
			pwsh: 'node build/azure-pipelines/common/runWithTimeout.ts 45 -- powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File build/azure-pipelines/win32/collect-network-diagnostics.ps1 -OutputDirectory "$(Build.SourcesDirectory)\\.build\\logs\\network"',
			displayName: 'Collect Windows network failure diagnostics',
			condition: 'failed()',
			continueOnError: true,
			timeoutInMinutes: 2,
		});
		assert.equal(steps.filter(step => step.displayName === 'Collect Windows network failure diagnostics').length, 1);
	});

	test('publishes the new compile artifact only when collection initialized, and reuses CI/flaky log outputs', () => {
		const output = readPipeline('win32/product-build-win32.yml').jobs[0].templateContext.outputs.find(output => output.targetPath.endsWith('/.build/logs/network'));
		assert.deepStrictEqual(output, {
			output: 'pipelineArtifact',
			targetPath: '$(Build.SourcesDirectory)/.build/logs/network',
			artifactName: 'network-diagnostics-windows-$(VSCODE_ARCH)-compile-$(System.JobAttempt)',
			displayName: 'Publish network failure diagnostics',
			sbomEnabled: false,
			isProduction: false,
			condition: 'and(failed(), eq(variables[\'VSCODE_NETWORK_DIAGNOSTICS_CAPTURED\'], \'true\'))',
		});
		assert.deepStrictEqual(['win32/product-build-win32-ci.yml', 'common/product-smoke-flaky-build.yml'].map(file =>
			readPipeline(file).jobs[0].templateContext.outputs.find(output => output.targetPath.endsWith('/.build/logs'))?.condition
		), ['always()', 'succeededOrFailed()']);
	});
});
