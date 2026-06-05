/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostClientResourceChannel } from '../../common/agentHostClientResourceChannel.js';
import { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';
import {
	AgentHostResourcePermissionError,
	IAgentHostResourceService,
	LOCAL_AGENT_HOST_ADDRESS,
} from '../../common/agentHostResourceService.js';
import { ContentEncoding } from '../../common/state/protocol/commands.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';

interface IStubOpts {
	files?: Map<string, VSBuffer>;
	virtual?: Map<string, VSBuffer>;
	denyRead?: boolean;
}

/**
 * Hand-rolled {@link IAgentHostResourceService} stub. The channel only
 * exercises a couple of FS methods; everything else is a placeholder.
 */
function createResourceStub(opts: IStubOpts): IAgentHostResourceService {
	const files = opts.files ?? new Map();
	const virtual = opts.virtual ?? new Map();
	const empty = observableValue<readonly never[]>('test', []);
	return {
		_serviceBrand: undefined,
		check: async () => !opts.denyRead,
		async list() { throw new Error('not implemented'); },
		async read(_addr, uri) {
			if (opts.denyRead) {
				throw new AgentHostResourcePermissionError({ channel: 'ahp-root://', uri: uri.toString(), read: true });
			}
			const key = uri.toString();
			const real = files.get(key);
			if (real) {
				return { bytes: real };
			}
			const virtualBuf = virtual.get(key);
			if (virtualBuf) {
				return { bytes: virtualBuf };
			}
			throw new Error(`No such file: ${key}`);
		},
		async write() { /* */ },
		async del() { /* */ },
		async move() { /* */ },
		async copy() { /* */ },
		async resolve() { throw new Error('not implemented'); },
		async mkdir() { /* */ },
		async request() { /* */ },
		pendingFor: () => empty,
		allPending: empty,
		findPending: () => undefined,
		grantImplicitRead: () => Disposable.None,
		connectionClosed: () => { },
	};
}

suite('AgentHostClientResourceChannel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChannel(opts: IStubOpts = {}) {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		const logger = store.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'local-1', transport: 'local' },
			fileService,
			new NullLogService(),
		));
		const service = createResourceStub(opts);
		const channel = new AgentHostClientResourceChannel(logger, service);
		return { fileService, logger, channel };
	}

	async function readEntries(fileService: FileService, logger: AhpJsonlLogger) {
		await logger.flush();
		const content = (await fileService.readFile(logger.resource)).value.toString();
		return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
	}

	test('uses LOCAL_AGENT_HOST_ADDRESS for gating', async () => {
		const seenAddresses: string[] = [];
		const baseStub = createResourceStub({ files: new Map([[URI.file('/x.txt').toString(), VSBuffer.fromString('x')]]) });
		const channel = new AgentHostClientResourceChannel(undefined, {
			...baseStub,
			read: async (addr, uri) => {
				seenAddresses.push(addr);
				return baseStub.read(addr, uri);
			},
		});
		await channel.call(undefined, 'resourceRead', { uri: URI.file('/x.txt').toString() });
		assert.deepStrictEqual(seenAddresses, [LOCAL_AGENT_HOST_ADDRESS]);
	});

	test('reads existing files via the resource service', async () => {
		const uri = URI.file('/hello.txt');
		const { channel } = makeChannel({ files: new Map([[uri.toString(), VSBuffer.fromString('hi')]]) });
		const result = await channel.call<{ data: string; encoding: ContentEncoding }>(undefined, 'resourceRead', { uri: uri.toString() });
		assert.strictEqual(result.encoding, ContentEncoding.Base64);
		assert.strictEqual(decodeBase64(result.data).toString(), 'hi');
	});

	test('falls back to virtual content for unknown URIs', async () => {
		const uri = URI.parse('untitled:/Untitled-1');
		const { channel } = makeChannel({ virtual: new Map([[uri.toString(), VSBuffer.fromString('virtual content')]]) });
		const result = await channel.call<{ data: string; encoding: ContentEncoding }>(undefined, 'resourceRead', { uri: uri.toString() });
		assert.strictEqual(result.encoding, ContentEncoding.Base64);
		assert.strictEqual(decodeBase64(result.data).toString(), 'virtual content');
	});

	test('translates permission denial to a logged PermissionDenied wire frame', async () => {
		const { fileService, logger, channel } = makeChannel({ denyRead: true });
		const uri = URI.file('/secret.txt');
		await channel.call(undefined, 'resourceRead', { uri: uri.toString() }).then(
			() => assert.fail('expected error'),
			err => assert.ok(err instanceof AgentHostResourcePermissionError),
		);

		const entries = await readEntries(fileService, logger);
		const errorFrame = entries.find(e => e.error);
		assert.ok(errorFrame, 'expected logged error frame');
		assert.strictEqual(errorFrame.error.data?.request?.uri, uri.toString());
	});
});
