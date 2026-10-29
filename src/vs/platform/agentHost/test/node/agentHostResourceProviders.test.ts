/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../files/common/fileService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { NullLogService } from '../../../log/common/log.js';
import { AhpErrorCodes, ContentEncoding, ResourceType, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import { AgentHostResourceProviders } from '../../node/agentHostResourceProviders.js';

suite('AgentHostResourceProviders', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fileService: FileService;
	let resources: AgentHostResourceProviders;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection([IFileService, fileService]), true));
		resources = disposables.add(instantiationService.createInstance(AgentHostResourceProviders));
	});

	test('routes by scheme and forwards the URI and encoding', async () => {
		const calls: { scheme: string; uri: string; encoding: ContentEncoding }[] = [];
		for (const scheme of ['first-resource', 'second-resource']) {
			disposables.add(resources.registerProvider(scheme, {
				read: async (uri, encoding) => {
					calls.push({ scheme, uri: uri.toString(), encoding });
					return { data: scheme, encoding, contentType: 'text/plain' };
				},
			}));
		}

		const first = await resources.read(URI.parse('first-resource:/content?query'), ContentEncoding.Utf8);
		const second = await resources.read(URI.parse('second-resource:/other#fragment'), ContentEncoding.Base64);

		assert.deepStrictEqual({ calls, results: [first, second] }, {
			calls: [
				{ scheme: 'first-resource', uri: 'first-resource:/content?query', encoding: ContentEncoding.Utf8 },
				{ scheme: 'second-resource', uri: 'second-resource:/other#fragment', encoding: ContentEncoding.Base64 },
			],
			results: [
				{ data: 'first-resource', encoding: ContentEncoding.Utf8, contentType: 'text/plain' },
				{ data: 'second-resource', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
			],
		});
	});

	test('falls back to the filesystem for unregistered schemes', async () => {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/content.txt' });
		await fileService.writeFile(uri, VSBuffer.fromString('content'));

		assert.deepStrictEqual([
			await resources.read(uri, ContentEncoding.Utf8),
			await resources.read(uri, ContentEncoding.Base64),
		], [
			{ data: 'content', encoding: ContentEncoding.Utf8, contentType: 'text/plain' },
			{ data: 'Y29udGVudA==', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
		]);
	});

	test('routes operations by their resource or source URI and forwards parameters', async () => {
		const calls: { operation: string; params: object }[] = [];
		disposables.add(resources.registerProvider('test-resource', {
			list: async uri => {
				calls.push({ operation: 'list', params: uri });
				return { entries: [] };
			},
			write: async params => {
				calls.push({ operation: 'write', params });
				return {};
			},
			copy: async params => {
				calls.push({ operation: 'copy', params });
				return {};
			},
			delete: async params => {
				calls.push({ operation: 'delete', params });
				return {};
			},
			move: async params => {
				calls.push({ operation: 'move', params });
				return {};
			},
			resolve: async params => {
				calls.push({ operation: 'resolve', params });
				return { uri: params.uri, type: ResourceType.File };
			},
			mkdir: async params => {
				calls.push({ operation: 'mkdir', params });
				return {};
			},
		}));
		const channel = 'ahp-root://';
		const uri = URI.parse('test-resource:/content?query#fragment');
		const source = uri.toString();
		const destination = URI.from({ scheme: Schemas.inMemory, path: '/destination' }).toString();

		const results = [
			await resources.list(uri),
			await resources.write({ channel, uri: source, data: 'content', encoding: ContentEncoding.Utf8, createOnly: true }),
			await resources.copy({ channel, source, destination, failIfExists: true }),
			await resources.delete({ channel, uri: source, recursive: true }),
			await resources.move({ channel, source, destination, failIfExists: true }),
			await resources.resolve({ channel, uri: source, followSymlinks: false }),
			await resources.mkdir({ channel, uri: source }),
		];

		assert.deepStrictEqual({ calls, results }, {
			calls: [
				{ operation: 'list', params: uri },
				{ operation: 'write', params: { channel, uri: source, data: 'content', encoding: ContentEncoding.Utf8, createOnly: true } },
				{ operation: 'copy', params: { channel, source, destination, failIfExists: true } },
				{ operation: 'delete', params: { channel, uri: source, recursive: true } },
				{ operation: 'move', params: { channel, source, destination, failIfExists: true } },
				{ operation: 'resolve', params: { channel, uri: source, followSymlinks: false } },
				{ operation: 'mkdir', params: { channel, uri: source } },
			],
			results: [{ entries: [] }, {}, {}, {}, {}, { uri: source, type: ResourceType.File }, {}],
		});
	});

	test('rejects unsupported provider operations and restores filesystem fallback when unregistered', async () => {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/' });
		await fileService.writeFile(URI.joinPath(uri, 'content.txt'), VSBuffer.fromString('content'));
		const registration = disposables.add(resources.registerProvider(uri.scheme, {
			read: async () => ({ data: 'provider', encoding: ContentEncoding.Utf8, contentType: 'text/plain' }),
		}));

		await assert.rejects(resources.list(uri), {
			code: AhpErrorCodes.NotFound,
			message: `Resource operation 'list' is not supported for: ${uri.toString()}`,
		});
		registration.dispose();

		assert.deepStrictEqual(await resources.list(uri), {
			entries: [{ name: 'content.txt', type: 'file' }],
		});
	});

	test('rejects duplicate scheme registrations without replacing the provider', async () => {
		const result: ResourceReadResult = { data: 'first', encoding: ContentEncoding.Utf8, contentType: 'text/plain' };
		disposables.add(resources.registerProvider('test-resource', { read: async () => result }));

		assert.throws(() => disposables.add(resources.registerProvider('test-resource', {
			read: async () => ({ ...result, data: 'second' }),
		})), { message: 'Resource provider already registered for scheme: test-resource' });
		assert.deepStrictEqual(await resources.read(URI.parse('test-resource:/content'), ContentEncoding.Utf8), result);
	});

	test('unregisters on disposal, restoring fallback and allowing re-registration', async () => {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/content.txt' });
		await fileService.writeFile(uri, VSBuffer.fromString('file'));
		const result: ResourceReadResult = { data: 'provider', encoding: ContentEncoding.Utf8, contentType: 'text/plain' };
		const registration = disposables.add(resources.registerProvider(uri.scheme, { read: async () => result }));

		const before = await resources.read(uri, ContentEncoding.Utf8);
		registration.dispose();
		const after = await resources.read(uri, ContentEncoding.Utf8);
		disposables.add(resources.registerProvider(uri.scheme, { read: async () => ({ ...result, data: 'replacement' }) }));
		const replacement = await resources.read(uri, ContentEncoding.Utf8);

		assert.deepStrictEqual([before, after, replacement], [
			result,
			{ data: 'file', encoding: ContentEncoding.Utf8, contentType: 'text/plain' },
			{ data: 'replacement', encoding: ContentEncoding.Utf8, contentType: 'text/plain' },
		]);
	});
});
