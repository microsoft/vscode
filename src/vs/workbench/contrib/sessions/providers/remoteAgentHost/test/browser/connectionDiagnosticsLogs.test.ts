/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { createInMemoryFileService } from '../../../../../../../platform/files/test/common/inMemoryFileService.js';
import { collectConnectionLogs, selectConnectionLogLines, selectSharedProcessLogEntries } from '../../browser/connectionDiagnosticsLogs.js';

suite('Connection diagnostics log excerpt', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const prefix = '2026-09-16 12:00:00.000';

	test('includes lifecycle messages but excludes protocol payloads and multiline continuations', () => {
		const lines = selectConnectionLogLines([
			`${prefix} [info] [WebTunnelAgentHost] Connecting to tunnel test`,
			`${prefix} [trace] [RemoteAgentHostProtocol] Unrecognized message: private user content`,
			`${prefix} [error] [BrowserTunnelAgentHost] Failed to enumerate tunnels https://host/?token=secret`,
			'    private response body',
			'[RemoteAgentHost] Connected arbitrary response text',
			'[info] [RemoteAgentHost] Connected another continuation',
			`${prefix} [warning] [RemoteAgentHostProtocol] Reconnect attempt failed`,
			`${prefix} [warning] [RemoteAgentHost] Connection closed`,
			'  "prompt": "[RemoteAgentHost] Connected user-provided payload"',
			'[Other] unrelated event',
		].join('\n'));
		assert.deepStrictEqual(lines, [
			`${prefix} [info] [WebTunnelAgentHost] Connecting to tunnel test`,
			`${prefix} [error] [BrowserTunnelAgentHost] Failed to enumerate tunnels https://host/?[redacted]`,
			`${prefix} [warning] [RemoteAgentHostProtocol] Reconnect attempt failed`,
			`${prefix} [warning] [RemoteAgentHost] Connection closed`,
		]);
	});

	test('limits matching messages to the most recent 200 lines', () => {
		const lines = selectConnectionLogLines(Array.from({ length: 205 }, (_, index) => `${prefix} [info] [RemoteAgentHost] Connecting to ${index}`).join('\n'));
		assert.deepStrictEqual({ count: lines.length, first: lines[0], last: lines.at(-1) }, {
			count: 200, first: `${prefix} [info] [RemoteAgentHost] Connecting to 5`, last: `${prefix} [info] [RemoteAgentHost] Connecting to 204`,
		});
	});

	test('reads only the bounded tail and fails explicitly when the Window log is absent', async () => {
		const service = createInMemoryFileService(store, 'test');
		const file = URI.parse('test:/window.log');
		const missing = await collectConnectionLogs(service, { window: file });
		assert.deepStrictEqual(missing.entries.map(entry => entry.label), ['Collection started at', 'Window log collection failed']);
		await service.writeFile(file, VSBuffer.fromString(`${prefix} [info] [RemoteAgentHost] Connecting to oldest\n${'x'.repeat(140 * 1024)}\n${prefix} [info] [RemoteAgentHost] Connected to newest`));
		const section = await collectConnectionLogs(service, { window: file });
		const text = section.entries.map(entry => entry.value).join('\n');
		assert.deepStrictEqual({
			oldest: text.includes('oldest'),
			newest: text.includes('[RemoteAgentHost] Connected to newest'),
			bound: section.description?.includes('128 KiB'),
		}, { oldest: false, newest: true, bound: true });
	});

	test('keeps remote host service lines from the Shared log with the output of warnings and errors, but not stack traces', () => {
		const entries = selectSharedProcessLogEntries([
			`${prefix} [info] [SSHRemoteAgentHost] Connecting to dev@build:22`,
			`${prefix} [info] [ExtensionManagementService] Installed an extension`,
			`${prefix} [info] [SSHRemoteAgentHost] Built 2 auth attempt(s): agent, key`,
			'unrelated continuation after an info line',
			`${prefix} [error] [SSHRemoteAgentHost] Failed to connect to build Error: All configured authentication methods failed`,
			'    at Client.connect (ssh.js:1:1)',
			`${prefix} [warning] [WSLRemoteAgentHost] Agent host in 'Ubuntu' exited (code=1, signal=null).`,
			'Output: Downloading VS Code Server https://update.code.visualstudio.com/?token=secret',
			...Array.from({ length: 25 }, (_, index) => `line ${index}`),
			`${prefix} [warning] [Other] Unrelated warning`,
			'unrelated output',
			`${prefix} [info] [DevContainerAgentHost] Starting container`,
		].join('\n'));
		assert.deepStrictEqual(entries, [
			[`${prefix} [info] [SSHRemoteAgentHost] Connecting to dev@build:22`],
			[`${prefix} [info] [SSHRemoteAgentHost] Built 2 auth attempt(s): agent, key`],
			[`${prefix} [error] [SSHRemoteAgentHost] Failed to connect to build Error: All configured authentication methods failed`],
			[
				`${prefix} [warning] [WSLRemoteAgentHost] Agent host in 'Ubuntu' exited (code=1, signal=null).`,
				'Output: Downloading VS Code Server https://update.code.visualstudio.com/?[redacted]',
				...Array.from({ length: 19 }, (_, index) => `line ${index}`),
			],
			[`${prefix} [info] [DevContainerAgentHost] Starting container`],
		]);
	});

	test('redacts commands, which may come from user settings, and token arguments in output', () => {
		const entries = selectSharedProcessLogEntries([
			`${prefix} [info] [SSHRemoteAgentHost] Using custom agent host command: my-host --auth secret123; skipping endpoint discovery/selection`,
			`${prefix} [info] [SSHRemoteAgentHost] Starting remote agent host: bash -l -c 'exec code agent-host --port 0'`,
			`${prefix} [trace] [WSLRemoteAgentHost] bootstrap script: export API_KEY=abc`,
			`${prefix} [error] [SSHRemoteAgentHost] Agent host exited`,
			'Output: started with --connection-token abc and --without-connection-token --port 0',
		].join('\n'));
		assert.deepStrictEqual(entries, [
			[`${prefix} [info] [SSHRemoteAgentHost] Using custom agent host command: [redacted command]`],
			[`${prefix} [info] [SSHRemoteAgentHost] Starting remote agent host: [redacted command]`],
			[`${prefix} [trace] [WSLRemoteAgentHost] bootstrap script: [redacted command]`],
			[
				`${prefix} [error] [SSHRemoteAgentHost] Agent host exited`,
				'Output: started with --connection-token [redacted] and --without-connection-token --port 0',
			],
		]);
	});

	test('shows repeated messages once, at their latest time, so retries of one host keep the others', () => {
		const attempt = (second: number) => [
			`2026-09-16 12:00:0${second}.000 [info] [SSHRemoteAgentHost] Connecting to ssh:wsl-ubuntu`,
			`2026-09-16 12:00:0${second}.100 [error] [SSHRemoteAgentHost] Failed to connect to wsl-ubuntu connect ECONNREFUSED 127.0.0.1:2222`,
		];
		const entries = selectSharedProcessLogEntries([
			...attempt(1),
			'2026-09-16 12:00:02.000 [info] [TunnelAgentHost] Preparing gateway selection for tunnel laptop',
			...attempt(3),
			...attempt(5),
		].join('\n'));
		assert.deepStrictEqual(entries, [
			['2026-09-16 12:00:02.000 [info] [TunnelAgentHost] Preparing gateway selection for tunnel laptop'],
			['2026-09-16 12:00:05.000 [info] [SSHRemoteAgentHost] Connecting to ssh:wsl-ubuntu (logged 3 times since 2026-09-16 12:00:01.000)'],
			['2026-09-16 12:00:05.100 [error] [SSHRemoteAgentHost] Failed to connect to wsl-ubuntu connect ECONNREFUSED 127.0.0.1:2222 (logged 3 times since 2026-09-16 12:00:01.100)'],
		]);
	});

	test('merges the Window and Shared logs by time, tagged with their log and without the home folder', async () => {
		const service = createInMemoryFileService(store, 'test');
		const window = URI.parse('test:/window.log');
		const shared = URI.parse('test:/sharedprocess.log');
		await service.writeFile(window, VSBuffer.fromString([
			'2026-09-16 12:00:01.000 [info] [RemoteAgentHost] Connecting to ssh:build',
			'2026-09-16 12:00:05.000 [error] [RemoteAgentHost] Failed to connect to ssh:build',
		].join('\n')));
		await service.writeFile(shared, VSBuffer.fromString([
			'2026-09-16 12:00:02.000 [info] [SSHRemoteAgentHost] reconnect: identityFiles=["/home/dev/.ssh/id_ed25519"], explicit key=(none)',
			'2026-09-16 12:00:03.000 [error] [SSHRemoteAgentHost] Failed to connect to build: /home/developer/.ssh/config',
		].join('\n')));
		const merged = await collectConnectionLogs(service, { window, shared }, '/home/dev');
		await service.del(shared);
		const sharedMissing = await collectConnectionLogs(service, { window, shared }, '/home/dev');
		assert.deepStrictEqual({ merged: merged.entries.slice(1), sharedMissing: sharedMissing.entries.slice(1).map(entry => entry.label) }, {
			merged: [{
				label: 'Messages',
				value: [
					'[Window] 2026-09-16 12:00:01.000 [info] [RemoteAgentHost] Connecting to ssh:build',
					'[Shared] 2026-09-16 12:00:02.000 [info] [SSHRemoteAgentHost] reconnect: identityFiles=["~/.ssh/id_ed25519"], explicit key=(none)',
					'[Shared] 2026-09-16 12:00:03.000 [error] [SSHRemoteAgentHost] Failed to connect to build: /home/developer/.ssh/config',
					'[Window] 2026-09-16 12:00:05.000 [error] [RemoteAgentHost] Failed to connect to ssh:build',
				].join('\n'),
			}],
			sharedMissing: ['Messages', 'Shared log collection failed'],
		});
	});
});
