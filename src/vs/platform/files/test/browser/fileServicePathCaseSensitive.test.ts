/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderCapabilities, FileType, IFileChange, IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileReadStreamOptions, IFileSystemProvider, IFileWriteOptions, IStat, IWatchOptions } from '../../common/files.js';
import { FileService } from '../../common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ReadableStreamEvents } from '../../../../base/common/stream.js';

/**
 * A minimal IFileSystemProvider that also implements the optional isPathCaseSensitive hook.
 */
class CaseSensitivityAwareProvider implements IFileSystemProvider {

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly;

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	/** Controls what isPathCaseSensitive() resolves to. */
	caseSensitiveResult: boolean = false;

	/** How many times isPathCaseSensitive was invoked. */
	probeCallCount: number = 0;

	/** If set, isPathCaseSensitive() will reject with this error. */
	probeError: Error | undefined;

	async isPathCaseSensitive(_resource: URI): Promise<boolean> {
		this.probeCallCount++;
		if (this.probeError) {
			throw this.probeError;
		}
		return this.caseSensitiveResult;
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable { return { dispose() { } }; }
	async stat(_resource: URI): Promise<IStat> { return undefined!; }
	async mkdir(_resource: URI): Promise<void> { }
	async readdir(_resource: URI): Promise<[string, FileType][]> { return []; }
	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> { }
	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> { }
	async readFile(_resource: URI): Promise<Uint8Array> { return new Uint8Array(); }
	readFileStream(_resource: URI, _opts: IFileReadStreamOptions, _token: CancellationToken): ReadableStreamEvents<Uint8Array> { return undefined!; }
	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> { }
	async open(_resource: URI, _opts: IFileOpenOptions): Promise<number> { return 0; }
	async close(_fd: number): Promise<void> { }
	async read(_fd: number, _pos: number, _data: Uint8Array, _offset: number, _length: number): Promise<number> { return 0; }
	async write(_fd: number, _pos: number, _data: Uint8Array, _offset: number, _length: number): Promise<number> { return 0; }
}

suite('FileService - PathCaseSensitive Cache', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(provider: IFileSystemProvider, scheme = 'test'): FileService {
		const service = disposables.add(new FileService(new NullLogService()));
		disposables.add(service.registerProvider(scheme, provider));
		return service;
	}

	// -------------------------------------------------------------------------
	// hasCapability — cache miss falls back to provider capability bits
	// -------------------------------------------------------------------------

	test('hasCapability falls back to provider capability bits on cache miss', () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.capabilities = FileSystemProviderCapabilities.PathCaseSensitive;
		const service = createService(provider);

		const resource = URI.parse('test://foo/bar');
		assert.strictEqual(
			service.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive),
			true,
			'should read PathCaseSensitive bit from provider when cache is empty'
		);
	});

	test('hasCapability returns false when provider does not advertise PathCaseSensitive and cache is empty', () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.capabilities = FileSystemProviderCapabilities.Readonly;
		const service = createService(provider);

		const resource = URI.parse('test://foo/bar');
		assert.strictEqual(
			service.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive),
			false
		);
	});

	// -------------------------------------------------------------------------
	// resolvePathCaseSensitive — caches at scheme-root level
	// -------------------------------------------------------------------------

	test('resolvePathCaseSensitive caches result and subsequent hasCapability calls return cached value', async () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.caseSensitiveResult = true;
		provider.capabilities = FileSystemProviderCapabilities.Readonly; // static bit says NOT case-sensitive
		const service = createService(provider);

		const resource = URI.parse('test://foo/some/deep/path');

		// Before resolve: static bit says false
		assert.strictEqual(
			service.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive),
			false,
			'before resolve: reads static capability bit'
		);

		const result = await service.resolvePathCaseSensitive(resource);
		assert.strictEqual(result, true, 'resolvePathCaseSensitive should return what the provider reports');
		assert.strictEqual(provider.probeCallCount, 1);

		// After resolve: cache hit should override the static bit
		assert.strictEqual(
			service.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive),
			true,
			'after resolve: cached value should be used'
		);
	});

	test('resolvePathCaseSensitive cache is scheme-wide: sibling paths also see the cached value', async () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.caseSensitiveResult = false;
		const service = createService(provider);

		await service.resolvePathCaseSensitive(URI.parse('test://foo/a/b'));
		assert.strictEqual(provider.probeCallCount, 1);

		// A completely different deep path under the same scheme root should also see the cache.
		const differentPath = URI.parse('test://foo/x/y/z');
		assert.strictEqual(
			service.hasCapability(differentPath, FileSystemProviderCapabilities.PathCaseSensitive),
			false,
			'sibling path should see the cached scheme-root value'
		);
	});

	test('resolvePathCaseSensitive falls back to capability bits when provider has no isPathCaseSensitive method', async () => {
		const provider = new CaseSensitivityAwareProvider();
		(provider as any).isPathCaseSensitive = undefined;
		provider.capabilities = FileSystemProviderCapabilities.PathCaseSensitive;
		const service = createService(provider);

		const result = await service.resolvePathCaseSensitive(URI.parse('test://foo/bar'));
		assert.strictEqual(result, true, 'should fall back to provider capability bit');
		assert.strictEqual(provider.probeCallCount, 0, 'should not have called isPathCaseSensitive');
	});

	// -------------------------------------------------------------------------
	// resolvePathCaseSensitive — error path: warns and falls back, does not throw
	// -------------------------------------------------------------------------

	test('resolvePathCaseSensitive does not throw when provider probe rejects; falls back to capability bits', async () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.probeError = new Error('disk error');
		provider.capabilities = FileSystemProviderCapabilities.Readonly; // static: not case-sensitive
		const service = createService(provider);

		let result: boolean | undefined;
		try {
			result = await service.resolvePathCaseSensitive(URI.parse('test://foo/bar'));
		} catch {
			assert.fail('resolvePathCaseSensitive must not propagate provider errors');
		}

		assert.strictEqual(result, false, 'should fall back to static capability bit on error');
	});

	test('resolvePathCaseSensitive probe error does not populate cache', async () => {
		const provider = new CaseSensitivityAwareProvider();
		provider.probeError = new Error('disk error');
		provider.capabilities = FileSystemProviderCapabilities.Readonly;
		const service = createService(provider);

		const resource = URI.parse('test://foo/bar');
		await service.resolvePathCaseSensitive(resource); // swallows error

		// Cache must not have been populated — hasCapability still reads the static bit.
		assert.strictEqual(
			service.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive),
			false,
			'cache must not be populated when probe throws'
		);
	});
});
