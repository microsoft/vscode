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

	test('includes lifecycle messages but excludes protocol payloads and multiline continuations', () => {
		const lines = selectConnectionLogLines([
			'[info] [WebTunnelAgentHost] Connecting to tunnel test',
			'[trace] [RemoteAgentHostProtocol] Unrecognized message: private user content',
			'[error] [BrowserTunnelAgentHost] Failed to enumerate tunnels https://host/?token=secret',
			'    private response body',
			'  "prompt": "[RemoteAgentHost] Connected user-provided payload"',
			'[Other] unrelated event',
		].join('\n'));
		assert.deepStrictEqual(lines, [
			'[info] [WebTunnelAgentHost] Connecting to tunnel test',
			'[error] [BrowserTunnelAgentHost] Failed to enumerate tunnels https://host/?[redacted]',
		]);
	});

	test('limits matching messages to the most recent 200 lines', () => {
		const lines = selectConnectionLogLines(Array.from({ length: 205 }, (_, index) => `[RemoteAgentHost] Connecting to ${index}`).join('\n'));
		assert.deepStrictEqual({ count: lines.length, first: lines[0], last: lines.at(-1) }, {
			count: 200, first: '[RemoteAgentHost] Connecting to 5', last: '[RemoteAgentHost] Connecting to 204',
		});
	});

	test('reads only the bounded tail and fails explicitly when the Window log is absent', async () => {
		const service = store.add(new FileService(new NullLogService()));
		store.add(service.registerProvider('test', store.add(new InMemoryFileSystemProvider())));
		const file = URI.parse('test:/window.log');
		const missing = await collectConnectionLogs(service, file);
		assert.strictEqual(missing.entries.at(-1)?.label, 'Log collection failed');
		await service.writeFile(file, VSBuffer.fromString(`[RemoteAgentHost] Connecting to oldest\n${'x'.repeat(140 * 1024)}\n[RemoteAgentHost] Connected to newest`));
		const section = await collectConnectionLogs(service, file);
		const text = section.entries.map(entry => entry.value).join('\n');
		assert.deepStrictEqual({
			oldest: text.includes('oldest'),
			newest: text.includes('[RemoteAgentHost] Connected to newest'),
			bound: section.description?.includes('128 KiB'),
		}, { oldest: false, newest: true, bound: true });
	});
});
