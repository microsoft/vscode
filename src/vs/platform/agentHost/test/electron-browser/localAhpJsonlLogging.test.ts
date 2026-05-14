/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';
import { AgentHostClientResourceChannel } from '../../common/agentHostClientResourceChannel.js';
import { wrapAgentServiceWithAhpLogging } from '../../electron-browser/localAhpJsonlLogging.js';
import type { IAgentService } from '../../common/agentService.js';
import { ContentEncoding } from '../../common/state/protocol/commands.js';

suite('localAhpJsonlLogging', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function makeLogger() {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'local-1', transport: 'local' },
			fileService,
			new NullLogService(),
		));
		return { fileService, logger };
	}

	async function readEntries(fileService: FileService, logger: AhpJsonlLogger) {
		await logger.flush();
		const content = (await fileService.readFile(logger.resource)).value.toString();
		return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
	}

	test('logs request/response/notification frames around proxied calls', async () => {
		const { fileService, logger } = makeLogger();

		const target = {
			async authenticate(params: { resource: string; token: string }) { return { authenticated: params.token.length > 0 }; },
			async listSessions() { return ['a', 'b']; },
			async createSession(config: unknown) { return URI.parse(`agent-host://session/1?cfg=${JSON.stringify(config)}`); },
			async disposeTerminal() { return undefined; },
			async resourceRead(uri: URI) { throw new Error('boom: ' + uri.toString()); },
			dispatchAction(action: unknown, clientId: string, clientSeq: number) { void action; void clientId; void clientSeq; },
			get onDidAction() { return () => ({ dispose() { } }); },
		} as unknown as IAgentService;

		const wrapped = wrapAgentServiceWithAhpLogging(target, logger);

		await wrapped.authenticate({ resource: 'https://example.com', token: 'secret' });
		await wrapped.listSessions();
		await wrapped.createSession({ kind: 'demo' } as never);
		await wrapped.disposeTerminal(URI.parse('agent-host://terminal/1'));
		await assert.rejects(() => wrapped.resourceRead(URI.parse('agent-host://x/y')));
		wrapped.dispatchAction({ type: 'noop' } as never, 'client-1', 7);

		// Event accessors must pass through untouched (no log emitted, no wrapping).
		const eventFn = wrapped.onDidAction;
		assert.strictEqual(typeof eventFn, 'function');

		const entries = await readEntries(fileService, logger);
		const summary = entries.map(e => ({
			dir: e._ahpLog.dir,
			id: e.id,
			method: e.method,
			hasResult: Object.hasOwn(e, 'result'),
			hasError: Object.hasOwn(e, 'error'),
		}));

		assert.deepStrictEqual(summary, [
			{ dir: 'c2s', id: 1, method: 'authenticate', hasResult: false, hasError: false },
			{ dir: 's2c', id: 1, method: undefined, hasResult: true, hasError: false },
			{ dir: 'c2s', id: 2, method: 'listSessions', hasResult: false, hasError: false },
			{ dir: 's2c', id: 2, method: undefined, hasResult: true, hasError: false },
			{ dir: 'c2s', id: 3, method: 'createSession', hasResult: false, hasError: false },
			{ dir: 's2c', id: 3, method: undefined, hasResult: true, hasError: false },
			{ dir: 'c2s', id: 4, method: 'disposeTerminal', hasResult: false, hasError: false },
			{ dir: 's2c', id: 4, method: undefined, hasResult: true, hasError: false },
			{ dir: 'c2s', id: 5, method: 'resourceRead', hasResult: false, hasError: false },
			{ dir: 's2c', id: 5, method: undefined, hasResult: false, hasError: true },
			{ dir: 'c2s', id: undefined, method: 'dispatchAction', hasResult: false, hasError: false },
		]);

		assert.deepStrictEqual(entries[0].params, [{ resource: 'https://example.com', token: '<redacted>' }]);
		assert.strictEqual(entries[7].result, null);
	});

	test('logs reverse resource channel requests and responses', async () => {
		const { fileService, logger } = makeLogger();
		const channel = new AgentHostClientResourceChannel(fileService, logger);
		const uri = URI.file('/from-client.txt').toString();

		await channel.call(undefined, 'resourceWrite', { uri, data: 'hello', encoding: ContentEncoding.Utf8, createOnly: true });
		await channel.call(undefined, 'resourceRead', { uri });
		await assert.rejects(() => channel.call(undefined, 'resourceRead', { uri: URI.file('/missing.txt').toString() }));

		const entries = await readEntries(fileService, logger);
		const summary = entries.map(e => ({
			dir: e._ahpLog.dir,
			id: e.id,
			method: e.method,
			hasResult: Object.hasOwn(e, 'result'),
			hasError: Object.hasOwn(e, 'error'),
		}));

		assert.deepStrictEqual(summary, [
			{ dir: 's2c', id: undefined, method: 'resourceWrite', hasResult: false, hasError: false },
			{ dir: 'c2s', id: undefined, method: 'resourceWrite', hasResult: true, hasError: false },
			{ dir: 's2c', id: undefined, method: 'resourceRead', hasResult: false, hasError: false },
			{ dir: 'c2s', id: undefined, method: 'resourceRead', hasResult: true, hasError: false },
			{ dir: 's2c', id: undefined, method: 'resourceRead', hasResult: false, hasError: false },
			{ dir: 'c2s', id: undefined, method: 'resourceRead', hasResult: false, hasError: true },
		]);
		assert.deepStrictEqual(entries[0].params, { uri, data: 'hello', encoding: ContentEncoding.Utf8, createOnly: true });
		assert.deepStrictEqual(entries[1].result, {});
	});
});
