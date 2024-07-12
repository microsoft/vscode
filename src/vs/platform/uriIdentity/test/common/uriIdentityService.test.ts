/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { mock } from 'vs/base/test/common/mock';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

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

	test.skip('[perf] CPU pegged after some builds #194853', function () {

		const n = 100 + (2 ** 16);
		for (let i = 0; i < n; i++) {
			const uri = URI.parse(`foo://bar/${i}`);
			const uri2 = _service.asCanonicalUri(uri);

			assert.ok(uri2);
		}
	});
});
