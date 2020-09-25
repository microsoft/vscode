/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { LocalFileAccess, Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';

suite('network', () => {

	test('LocalFileAccess: URI', () => {

		// asCodeUri() & asFileUri(): simple, without authority
		let originalFileUri = URI.file(__filename);
		let codeUri = LocalFileAccess.asCodeUri(originalFileUri);
		assert.ok(codeUri.authority.length > 0);
		let fileUri = LocalFileAccess.asFileUri(codeUri);
		assert.equal(fileUri.authority.length, 0);
		assert(isEqual(originalFileUri, fileUri));

		// asCodeUri() & asFileUri(): with authority
		originalFileUri = URI.file(__filename).with({ authority: 'test-authority' });
		codeUri = LocalFileAccess.asCodeUri(originalFileUri);
		assert.equal(codeUri.authority, originalFileUri.authority);
		fileUri = LocalFileAccess.asFileUri(codeUri);
		assert(isEqual(originalFileUri, fileUri));
	});

	test('LocalFileAccess: moduleId', () => {
		const codeUri = LocalFileAccess.asCodeUri({ moduleId: 'vs/base/test/node/network.test', requireFn: require });
		assert.equal(codeUri.scheme, Schemas.vscodeFileResource);

		const fileUri = LocalFileAccess.asFileUri({ moduleId: 'vs/base/test/node/network.test', requireFn: require });
		assert.equal(fileUri.scheme, Schemas.file);
	});

	test('LocalFileAccess: query and fragment is dropped', () => {
		let originalFileUri = URI.file(__filename).with({ query: 'foo=bar', fragment: 'something' });
		let codeUri = LocalFileAccess.asCodeUri(originalFileUri);
		assert.equal(codeUri.query, '');
		assert.equal(codeUri.fragment, '');
	});
});
