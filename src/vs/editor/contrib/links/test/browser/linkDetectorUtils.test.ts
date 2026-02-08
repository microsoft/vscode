/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { resolveRelativeFileLink } from '../../browser/linkDetectorUtils.js';

suite('LinkDetectorUtils', () => {
	test('resolves file://./ links and preserves fragment', () => {
		const modelUri = URI.file('/workspace/folder/source.txt');

		const actual = resolveRelativeFileLink('file://./target.txt#L99', modelUri);

		assert.ok(URI.isUri(actual));
		assert.strictEqual(actual.toString(), 'file:///workspace/folder/target.txt#L99');
	});

	test('resolves file:///./ links and preserves query and fragment', () => {
		const modelUri = URI.file('/workspace/folder/source.txt');

		const actual = resolveRelativeFileLink('file:///./target.txt?x=1#L99', modelUri);

		assert.ok(URI.isUri(actual));
		assert.strictEqual(actual.toString(), 'file:///workspace/folder/target.txt?x%3D1#L99');
	});

	test('leaves non-relative file links unchanged', () => {
		const modelUri = URI.file('/workspace/folder/source.txt');
		const uri = 'file:///workspace/folder/target.txt#L99';

		const actual = resolveRelativeFileLink(uri, modelUri);

		assert.strictEqual(actual, uri);
	});
});
