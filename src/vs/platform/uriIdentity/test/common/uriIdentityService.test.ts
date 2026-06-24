/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { UriIdentityService } from '../../common/uriIdentityService.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IFileService, FileSystemProviderCapabilities } from '../../../files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('URI Identity', function () {

	class FakeFileService extends mock<IFileService>() {

		override onDidChangeFileSystemProviderCapabilities = Event.None;
		override onDidChangeFileSystemProviderRegistrations = Event.None;

		constructor(readonly data: Map<string, FileSystemProviderCapabilities>) {
			super();
		}
		override hasProvider(uri: URI) {
			return this.data.has(uri.scheme);
		}
		override hasCapability(uri: URI, flag: FileSystemProviderCapabilities): boolean {
			const mask = this.data.get(uri.scheme) ?? 0;
			return Boolean(mask & flag);
		}
	}

	let _service: UriIdentityService;

	setup(function () {
		_service = new UriIdentityService(new FakeFileService(new Map([
			['bar', FileSystemProviderCapabilities.PathCaseSensitive],
			['foo', FileSystemProviderCapabilities.None]
		])));
	});

	teardown(function () {
		_service.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertCanonical(input: URI, expected: URI, service: UriIdentityService = _service) {
		const actual = service.asCanonicalUri(input);
		assert.strictEqual(actual.toString(), expected.toString());
		assert.ok(service.extUri.isEqual(actual, expected));
	}

	test('extUri (isEqual)', function () {
		const a = URI.parse('foo://bar/bang');
		const a1 = URI.parse('foo://bar/BANG');
		const b = URI.parse('bar://bar/bang');
		const b1 = URI.parse('bar://bar/BANG');

		assert.strictEqual(_service.extUri.isEqual(a, a1), true);
		assert.strictEqual(_service.extUri.isEqual(a1, a), true);

		assert.strictEqual(_service.extUri.isEqual(b, b1), false);
		assert.strictEqual(_service.extUri.isEqual(b1, b), false);
	});

	test('asCanonicalUri (casing)', function () {

		const a = URI.parse('foo://bar/bang');
		const a1 = URI.parse('foo://bar/BANG');
		const b = URI.parse('bar://bar/bang');
		const b1 = URI.parse('bar://bar/BANG');

		assertCanonical(a, a);
		assertCanonical(a1, a);

		assertCanonical(b, b);
		assertCanonical(b1, b1); // case sensitive
	});

	test('asCanonicalUri (normalization)', function () {
		const a = URI.parse('foo://bar/bang');
		assertCanonical(a, a);
		assertCanonical(URI.parse('foo://bar/./bang'), a);
		assertCanonical(URI.parse('foo://bar/./bang'), a);
		assertCanonical(URI.parse('foo://bar/./foo/../bang'), a);
	});

	test('asCanonicalUri (keep fragement)', function () {

		const a = URI.parse('foo://bar/bang');

		assertCanonical(a, a);
		assertCanonical(URI.parse('foo://bar/./bang#frag'), a.with({ fragment: 'frag' }));
		assertCanonical(URI.parse('foo://bar/./bang#frag'), a.with({ fragment: 'frag' }));
		assertCanonical(URI.parse('foo://bar/./bang#frag'), a.with({ fragment: 'frag' }));
		assertCanonical(URI.parse('foo://bar/./foo/../bang#frag'), a.with({ fragment: 'frag' }));

		const b = URI.parse('foo://bar/bazz#frag');
		assertCanonical(b, b);
		assertCanonical(URI.parse('foo://bar/bazz'), b.with({ fragment: '' }));
		assertCanonical(URI.parse('foo://bar/BAZZ#DDD'), b.with({ fragment: 'DDD' })); // lower-case path, but fragment is kept
	});

	test('[perf] clears cache when overflown with respect to access time', () => {
		const CACHE_SIZE = 2 ** 16;
		const getUri = (i: number) => URI.parse(`foo://bar/${i}`);

		const FIRST = 0;
		const SECOND = 1;
		const firstCached = _service.asCanonicalUri(getUri(FIRST));
		const secondCached = _service.asCanonicalUri(getUri(SECOND));
		for (let i = 2; i < CACHE_SIZE - 1; i++) {
			_service.asCanonicalUri(getUri(i));
		}

		// Assert that the first URI is still the same object.
		assert.strictEqual(_service.asCanonicalUri(getUri(FIRST)), firstCached);

		// Clear the cache.
		_service.asCanonicalUri(getUri(CACHE_SIZE - 1));

		// First URI should still be the same object.
		assert.strictEqual(_service.asCanonicalUri(getUri(FIRST)), firstCached);
		// But the second URI should be a new object, since it was evicted.
		assert.notStrictEqual(_service.asCanonicalUri(getUri(SECOND)), secondCached);
	});

	test('[perf] preserves order of access time on cache cleanup', () => {
		const SIZE = 2 ** 16;
		const getUri = (i: number) => URI.parse(`foo://bar/${i}`);

		const FIRST = 0;
		const firstCached = _service.asCanonicalUri(getUri(FIRST));
		for (let i = 1; i < SIZE - 2; i++) {
			_service.asCanonicalUri(getUri(i));
		}
		const LAST = SIZE - 2;
		const lastCached = _service.asCanonicalUri(getUri(LAST));

		// Clear the cache.
		_service.asCanonicalUri(getUri(SIZE - 1));

		// Batch 2
		const BATCH2_FIRST = SIZE;
		const batch2FirstCached = _service.asCanonicalUri(getUri(BATCH2_FIRST));
		const BATCH2_SECOND = SIZE + 1;
		const batch2SecondCached = _service.asCanonicalUri(getUri(BATCH2_SECOND));
		const BATCH2_THIRD = SIZE + 2;
		const batch2ThirdCached = _service.asCanonicalUri(getUri(BATCH2_THIRD));
		for (let i = SIZE + 3; i < SIZE + Math.floor(SIZE / 2) - 1; i++) {
			_service.asCanonicalUri(getUri(i));
		}
		const BATCH2_LAST = SIZE + Math.floor(SIZE / 2);
		const batch2LastCached = _service.asCanonicalUri(getUri(BATCH2_LAST));

		// Clean up the cache.
		_service.asCanonicalUri(getUri(SIZE + Math.ceil(SIZE / 2) + 1));

		// Both URIs from the first batch should be evicted.
		assert.notStrictEqual(_service.asCanonicalUri(getUri(FIRST)), firstCached);
		assert.notStrictEqual(_service.asCanonicalUri(getUri(LAST)), lastCached);

		// But the URIs from the second batch should still be the same objects.
		// Except for the first one, which is removed as a median value.
		assert.notStrictEqual(_service.asCanonicalUri(getUri(BATCH2_FIRST)), batch2FirstCached);
		assert.deepStrictEqual(_service.asCanonicalUri(getUri(BATCH2_SECOND)), batch2SecondCached);
		assert.deepStrictEqual(_service.asCanonicalUri(getUri(BATCH2_THIRD)), batch2ThirdCached);
		assert.deepStrictEqual(_service.asCanonicalUri(getUri(BATCH2_LAST)), batch2LastCached);
	});

	test('[perf] CPU pegged after some builds #194853', function () {

		const n = 100 + (2 ** 16);
		for (let i = 0; i < n; i++) {
			const uri = URI.parse(`foo://bar/${i}`);
			const uri2 = _service.asCanonicalUri(uri);

			assert.ok(uri2);
		}
	});
});
