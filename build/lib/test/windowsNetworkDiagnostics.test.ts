/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
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
		events?: {
			eventId: number;
			emitterProcessId?: string | null;
			clientProcessId?: string | null;
			queryType?: string | null;
			queryStatus?: string | null;
			processId?: string;
			exceptionCode?: string;
			exceptionType?: string | null;
			frames?: string[];
		}[];
		files?: { name: string; bytes: number }[];
		contentsCollected?: boolean;
		verdict?: string;
		isolationStarted?: boolean;
		listenerRunning?: boolean;
		proxy?: { port: number; reachable: boolean; connectResult: string; connectMs: number } | null;
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
		return [pscustomobject]@{ IsEnabled = -not ($env:DIAGNOSTIC_SCENARIO -in @('unavailable', 'channel-disabled') -and $ListLog -eq 'Microsoft-Windows-DNS-Client/Operational') }
	}
	if ($FilterXPath -notlike '*timediff(@SystemTime) <= 3600000*' -or $MaxEvents -ne 65) { throw 'Missing event bounds' }
	if ($env:DIAGNOSTIC_SCENARIO -eq 'empty') {
		Write-Error -ErrorId NoMatchingEventsFound -Category ObjectNotFound -Message 'No matching events' -ErrorAction Stop
	}
	$version = 0
	if ($LogName -eq 'Application' -and $FilterXPath.Contains("Provider[@Name='.NET Runtime']")) {
		if ($FilterXPath -notlike '*EventID=1026*') { throw 'Missing .NET Runtime event filter' }
		$listenerText = "Application: EtwNetworkEventListener.exe&#10;CoreCLR Version: 9.0.0&#10;Description: The process was terminated due to an unhandled exception.&#10;Exception Info: System.IO.IOException: $env:AZURE_DEVOPS_EXT_PAT&#10;   at NetworkIsolation.Proxy.HttpProxyServer.&lt;AcceptAsync&gt;d__12.MoveNext()&#10;   at NetworkIsolation.Proxy.HttpProxyServer.RunAsync(System.Threading.CancellationToken)"
		$otherText = 'Application: pwsh.exe&#10;Exception Info: System.InvalidOperationException: unrelated'
		return @($listenerText, $otherText) | ForEach-Object {
			$xml = '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><EventID>1026</EventID><Version>0</Version></System><EventData><Data>' + $_ + '</Data></EventData></Event>'
			[pscustomobject]@{ Id = 1026; Version = 0; ProcessId = 4; RecordId = 124; TimeCreated = [DateTime]'2026-08-24T08:26:12Z'; Xml = $xml; Message = $env:AZURE_DEVOPS_EXT_PAT } |
				Add-Member -MemberType ScriptMethod -Name ToXml -Value { $this.Xml } -PassThru
		}
	}
	if ($LogName -eq 'Application') {
		if (-not $FilterXPath.Contains("Data[@Name='AppName']='EtwNetworkEventListener.exe'")) { throw 'Missing listener filter' }
		$id = 1000
		$data = '<Data Name="AppName">EtwNetworkEventListener.exe</Data><Data Name="ProcessId">0x1f7d</Data><Data Name="ExceptionCode">c0000005</Data>'
	} else {
		if (-not $FilterXPath.Contains("Data[@Name='QueryName']='vsblob.dev.azure.com'")) { throw 'Missing DNS filter' }
		if ($LogName -eq 'System') {
			$id = 1014
			$data = '<Data Name="QueryName">vsblob.dev.azure.com</Data><Data Name="AddressLength">16</Data><Data Name="Address">020000350A00040A0000000000000000</Data>'
			if ($env:DIAGNOSTIC_SCENARIO -ne 'dns-timeout-v0') {
				$version = 1
				$data += '<Data Name="ClientPID">90</Data>'
			}
		} else {
			$id = 3008
			$data = '<Data Name="QueryName">vsblob.dev.azure.com</Data><Data Name="QueryType">1</Data><Data Name="QueryOptions">0</Data><Data Name="QueryStatus">11001</Data><Data Name="QueryResults">' + $env:AZURE_DEVOPS_EXT_PAT + '</Data>'
		}
	}
	$emitterProcessId = if ($env:DIAGNOSTIC_SCENARIO -eq 'missing-emitter-pid') { $null } else { 4321 }
	$execution = if ($null -eq $emitterProcessId) { '<Execution/>' } else { '<Execution ProcessID="' + $emitterProcessId + '" ThreadID="7"/>' }
	$xml = '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><EventID>' + $id + '</EventID><Version>' + $version + '</Version>' + $execution + '</System><EventData>' + $data + '</EventData></Event>'
	[pscustomobject]@{ Id = $id; Version = $version; ProcessId = $emitterProcessId; RecordId = 123; TimeCreated = [DateTime]'2026-08-24T08:26:13Z'; Xml = $xml; Message = $env:AZURE_DEVOPS_EXT_PAT } |
		Add-Member -MemberType ScriptMethod -Name ToXml -Value { $this.Xml } -PassThru
}
`;

function fixture(scenario: string, extraEnv: Record<string, string> = {}) {
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
	const env: NodeJS.ProcessEnv = { ...process.env, LOCALAPPDATA: localAppData, DIAGNOSTIC_SCENARIO: scenario, AZURE_DEVOPS_EXT_PAT: secret, BUILD_BUILDID: '467068' };
	for (const name of ['1ESNI_CONFIG_PATH', 'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
		delete env[name];
	}
	Object.assign(env, extraEnv);
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
				clr: f.section('listener-clr-exceptions').data.events?.map(event => [event.eventId, event.exceptionType, event.frames]),
				health: f.section('listener-health').data,
				timeouts: f.section('dns-timeouts').data.events?.map(event => [event.eventId, event.emitterProcessId, event.clientProcessId, event.queryType, event.queryStatus]),
				dns: f.section('dns-query-results').data.events?.map(event => [event.eventId, event.emitterProcessId, event.clientProcessId, event.queryType, event.queryStatus]),
				copiedLogs: f.section('listener-log-inventory').data.contentsCollected,
			}, {
				completed: true,
				buildId: '467068',
				unavailable: [],
				listener: [{ processId: 8061, startedAt: '2026-08-24T08:05:06.0000000Z' }],
				udp: [{ address: '127.0.0.1', port: 53, processId: 8061 }],
				tcp: [{ address: '::1', port: 53, processId: 8061 }],
				crash: [[1000, '0x1f7d', 'c0000005']],
				clr: [[1026, 'System.IO.IOException', ['NetworkIsolation.Proxy.HttpProxyServer.<AcceptAsync>d__12.MoveNext', 'NetworkIsolation.Proxy.HttpProxyServer.RunAsync']]],
				health: { verdict: 'notIsolated', isolationStarted: false, listenerRunning: true, proxy: null },
				timeouts: [[1014, '4321', '90', null, null]],
				dns: [[3008, '4321', null, '1', '11001']],
				copiedLogs: false,
			});
			const contents = readdirSync(f.output).map(file => readFileSync(path.join(f.output, file), 'utf8')).join('\n');
			assert.ok(!`${contents}\n${result.stdout}\n${result.stderr}`.includes(secret));
			assert.deepStrictEqual(readdirSync(f.output).sort(), [
				'capture.json', 'dns-query-results.json', 'dns-servers.json', 'dns-tcp-listeners.json', 'dns-timeouts.json',
				'dns-udp-endpoints.json', 'listener-clr-exceptions.json', 'listener-crashes.json', 'listener-health.json', 'listener-log-inventory.json', 'listener.json',
			]);
		} finally {
			f.dispose();
		}
	});

	test('reports a stopped Network Isolation listener and its refused proxy port as an infrastructure failure', async () => {
		// A port that was just released refuses connections, like the proxy port of a listener that exited.
		const closed = createServer().listen(0, '127.0.0.1');
		await once(closed, 'listening');
		const port = (closed.address() as AddressInfo).port;
		closed.close();
		await once(closed, 'close');
		const f = fixture('empty', { '1ESNI_CONFIG_PATH': 'C:\\NI', HTTPS_PROXY: `http://127.0.0.1:${port}` });
		try {
			const result = f.run();
			const health = f.section('listener-health').data;
			assert.deepStrictEqual({
				status: result.status,
				verdict: health.verdict,
				listenerRunning: health.listenerRunning,
				proxy: health.proxy && [health.proxy.port, health.proxy.reachable, health.proxy.connectResult],
				annotated: /##vso\[task\.logissue type=error\]The 1ES Network Isolation listener \(EtwNetworkEventListener\.exe\).*is no longer running/.test(result.stdout),
				addressRecorded: readFileSync(path.join(f.output, 'listener-health.json'), 'utf8').includes('127.0.0.1'),
			}, { status: 0, verdict: 'listenerStopped', listenerRunning: false, proxy: [port, false, 'ConnectionRefused'], annotated: true, addressRecorded: false });
		} finally {
			f.dispose();
		}
	});

	test('does not report an infrastructure failure while the listener and its proxy port are up', async () => {
		const proxy = createServer().listen(0, '127.0.0.1');
		await once(proxy, 'listening');
		const port = (proxy.address() as AddressInfo).port;
		const f = fixture('complete', { '1ESNI_CONFIG_PATH': 'C:\\NI', HTTPS_PROXY: `http://127.0.0.1:${port}` });
		try {
			const result = f.run();
			const health = f.section('listener-health').data;
			assert.deepStrictEqual({
				status: result.status,
				verdict: health.verdict,
				proxy: health.proxy && [health.proxy.port, health.proxy.reachable, health.proxy.connectResult],
				annotated: result.stdout.includes('type=error'),
			}, { status: 0, verdict: 'listenerRunning', proxy: [port, true, 'Success'], annotated: false });
		} finally {
			proxy.close();
			f.dispose();
		}
	});

	test('does not substitute the emitter PID for the missing client PID in event 1014/v0', () => {
		const f = fixture('dns-timeout-v0');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status,
				timeouts: f.section('dns-timeouts').data.events?.map(event => [event.eventId, event.emitterProcessId, event.clientProcessId]),
			}, { status: 0, timeouts: [[1014, '4321', null]] });
		} finally {
			f.dispose();
		}
	});

	test('preserves a nullable header PID independently of the payload client PID', () => {
		const f = fixture('missing-emitter-pid');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status,
				timeouts: f.section('dns-timeouts').data.events?.map(event => [event.eventId, event.emitterProcessId, event.clientProcessId]),
				dns: f.section('dns-query-results').data.events?.map(event => [event.eventId, event.emitterProcessId, event.clientProcessId]),
			}, { status: 0, timeouts: [[1014, null, '90']], dns: [[3008, null, null]] });
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

	test('records a disabled event channel without reporting it as a collection problem', () => {
		// The hosted Windows images disable the DNS Client operational channel.
		const f = fixture('channel-disabled');
		try {
			const result = f.run();
			assert.deepStrictEqual({
				status: result.status,
				unavailable: f.capture().unavailableSections,
				reason: f.section('dns-query-results').reason,
				warned: result.stdout.includes('type=warning'),
			}, { status: 0, unavailable: ['dns-query-results'], reason: 'channelDisabled', warned: false });
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
	template?: string;
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
		jobs: { templateContext: { outputs: PipelineOutput[] }; steps: PipelineStep[] }[];
	};
}

suite('Windows network diagnostic templates', () => {
	test('collects only on failure, with bounded and non-fatal execution', () => {
		assert.deepStrictEqual(readPipeline('win32/steps/product-build-win32-network-diagnostics.yml').steps, [{
			pwsh: 'node build/azure-pipelines/common/runWithTimeout.ts 45 -- powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File build/azure-pipelines/win32/collect-network-diagnostics.ps1 -OutputDirectory "$(Build.SourcesDirectory)\\.build\\logs\\network"',
			displayName: 'Collect Windows network failure diagnostics',
			condition: 'failed()',
			continueOnError: true,
			timeoutInMinutes: 2,
		}]);
	});

	test('collects after every other step of the compile and product test jobs', () => {
		// The 1ES template stops Network Isolation after the user steps, so the last user step still sees the listener.
		assert.deepStrictEqual([
			readPipeline('win32/steps/product-build-win32-compile.yml').steps.at(-1),
			readPipeline('win32/product-build-win32-test.yml').jobs[0].steps.at(-1),
			['win32/steps/product-build-win32-compile.yml', 'win32/steps/product-build-win32-test.yml'].filter(file =>
				readFileSync(path.join(pipelineRoot, file), 'utf8').includes('collect-network-diagnostics.ps1')),
		], [
			{ template: 'product-build-win32-network-diagnostics.yml@self' },
			{ template: './steps/product-build-win32-network-diagnostics.yml@self' },
			[],
		]);
	});

	test('publishes the new compile artifact only when collection initialized, and reuses CI, test and flaky log outputs', () => {
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
		assert.deepStrictEqual(['win32/product-build-win32-ci.yml', 'win32/product-build-win32-test.yml', 'common/product-smoke-flaky-build.yml'].map(file =>
			readPipeline(file).jobs[0].templateContext.outputs.find(output => output.targetPath.endsWith('/.build/logs'))?.condition
		), ['not(succeeded())', 'always()', 'succeededOrFailed()']);
	});
});
