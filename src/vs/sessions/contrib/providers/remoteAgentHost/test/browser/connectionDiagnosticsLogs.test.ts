/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { collectConnectionLogs, selectConnectionLogLines } from '../../browser/connectionDiagnosticsLogs.js';

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
		const service = store.add(new FileService(new NullLogService()));
		store.add(service.registerProvider('test', store.add(new InMemoryFileSystemProvider())));
		const file = URI.parse('test:/window.log');
		const missing = await collectConnectionLogs(service, file);
		assert.strictEqual(missing.entries.at(-1)?.label, 'Log collection failed');
		await service.writeFile(file, VSBuffer.fromString(`${prefix} [info] [RemoteAgentHost] Connecting to oldest\n${'x'.repeat(140 * 1024)}\n${prefix} [info] [RemoteAgentHost] Connected to newest`));
		const section = await collectConnectionLogs(service, file);
		const text = section.entries.map(entry => entry.value).join('\n');
		assert.deepStrictEqual({
			oldest: text.includes('oldest'),
			newest: text.includes('[RemoteAgentHost] Connected to newest'),
			bound: section.description?.includes('128 KiB'),
		}, { oldest: false, newest: true, bound: true });
	});
});
