/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderCapabilities, FileType, IFileReadStreamOptions, IFileService, IFileSystemProviderWithFileReadStreamCapability, IStat } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { AhpErrorCodes, ContentEncoding, ResourceType, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import { AgentHostResourceProviders } from '../../node/agentHostResourceProviders.js';

suite('AgentHostResourceProviders', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fileService: FileService;
	let resources: AgentHostResourceProviders;

	setup(() => {
		fileService = createInMemoryFileService(disposables, Schemas.inMemory);
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

	suite('ranged reads', () => {
		const text = (result: ResourceReadResult) => ({ ...result, data: decodeBase64(result.data).toString() });

		test('return just the requested bytes of a file, as base64', async () => {
			const uri = URI.from({ scheme: Schemas.inMemory, path: '/content.txt' });
			await fileService.writeFile(uri, VSBuffer.fromString('0123456789abcdef'));

			assert.deepStrictEqual([
				text(await resources.read(uri, ContentEncoding.Utf8, { position: 4, length: 6 })),
				text(await resources.read(uri, ContentEncoding.Utf8, { position: 10 })),
				text(await resources.read(uri, ContentEncoding.Utf8, { position: 100, length: 4 })),
			], [
				{ data: '456789', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
				{ data: 'abcdef', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
				{ data: '', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
			]);
		});

		test('ask the file system for only the requested bytes', async () => {
			const content = VSBuffer.fromString('0123456789abcdef');
			const requests: { position?: number; length?: number }[] = [];
			disposables.add(fileService.registerProvider('ranged-file', new class implements IFileSystemProviderWithFileReadStreamCapability {
				readonly capabilities = FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.Readonly;
				readonly onDidChangeCapabilities = Event.None;
				readonly onDidChangeFile = Event.None;
				watch() { return Disposable.None; }
				async stat(): Promise<IStat> { return { type: FileType.File, ctime: 0, mtime: 0, size: content.byteLength }; }
				async mkdir(): Promise<void> { throw new Error('not supported'); }
				async readdir(): Promise<[string, FileType][]> { return []; }
				async delete(): Promise<void> { throw new Error('not supported'); }
				async rename(): Promise<void> { throw new Error('not supported'); }
				readFileStream(_resource: URI, opts: IFileReadStreamOptions) {
					requests.push({ position: opts.position, length: opts.length });
					const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
					const start = opts.position ?? 0;
					stream.end(content.slice(start, opts.length === undefined ? undefined : start + opts.length).buffer);
					return stream;
				}
			}));

			const result = text(await resources.read(URI.parse('ranged-file:/content.bin'), ContentEncoding.Utf8, { position: 2, length: 3 }));

			assert.deepStrictEqual({ result: result.data, requests }, { result: '234', requests: [{ position: 2, length: 3 }] });
		});

		test('slice whole reads from providers that cannot read ranges', async () => {
			const encodings: ContentEncoding[] = [];
			disposables.add(resources.registerProvider('blob-resource', {
				read: async (_uri, encoding) => {
					encodings.push(encoding);
					return { data: 'hello world', encoding: ContentEncoding.Utf8, contentType: 'text/plain' };
				},
			}));

			const uri = URI.parse('blob-resource:/blob');
			assert.deepStrictEqual({
				results: [
					text(await resources.read(uri, ContentEncoding.Utf8, { position: 6, length: 3 })),
					text(await resources.read(uri, ContentEncoding.Utf8, { position: 6 })),
				],
				encodings,
			}, {
				results: [
					{ data: 'wor', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
					{ data: 'world', encoding: ContentEncoding.Base64, contentType: 'text/plain' },
				],
				encodings: [ContentEncoding.Base64, ContentEncoding.Base64],
			});
		});

		test('use a provider\'s own ranged read, and its whole read without a range', async () => {
			const calls: string[] = [];
			disposables.add(resources.registerProvider('ranged-resource', {
				read: async (_uri, encoding) => {
					calls.push(`read ${encoding}`);
					return { data: 'whole', encoding };
				},
				readRange: async (_uri, range) => {
					calls.push(`readRange ${range.position}+${range.length}`);
					return { data: 'cGFydA==', encoding: ContentEncoding.Base64 };
				},
			}));

			const uri = URI.parse('ranged-resource:/content');
			const results = [await resources.read(uri, ContentEncoding.Base64, { position: 1, length: 4 }), await resources.read(uri, ContentEncoding.Utf8)];

			assert.deepStrictEqual({ calls, results }, {
				calls: ['readRange 1+4', 'read utf-8'],
				results: [{ data: 'cGFydA==', encoding: ContentEncoding.Base64 }, { data: 'whole', encoding: ContentEncoding.Utf8 }],
			});
		});
	});
});
