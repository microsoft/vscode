/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_CLIENT_SCHEME, fromAgentClientUri, toAgentClientUri } from '../../common/agentClientUri.js';

suite('Agent Client URI transform', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a file URI', () => {
		const original = URI.file('/Users/user/plugins/my-plugin/index.js');
		const wrapped = toAgentClientUri(original, 'client-1');

		assert.strictEqual(wrapped.scheme, AGENT_CLIENT_SCHEME);
		assert.strictEqual(wrapped.authority, 'client-1');
		assert.ok(wrapped.path.startsWith('/file/'));

		const decoded = fromAgentClientUri(wrapped);
		assert.strictEqual(decoded.scheme, 'file');
		assert.strictEqual(decoded.path, original.path);
	});

	test('round-trips a URI with authority', () => {
		const original = URI.from({ scheme: 'https', authority: 'example.com', path: '/plugins/foo' });
		const wrapped = toAgentClientUri(original, 'c2');

		const decoded = fromAgentClientUri(wrapped);
		assert.strictEqual(decoded.scheme, 'https');
		assert.strictEqual(decoded.authority, 'example.com');
		assert.strictEqual(decoded.path, '/plugins/foo');
	});

	test('encodes missing authority as dash', () => {
		const original = URI.from({ scheme: 'inmemory', path: '/test/file.txt' });
		const wrapped = toAgentClientUri(original, 'c3');

		assert.ok(wrapped.path.includes('/-/'));

		const decoded = fromAgentClientUri(wrapped);
		assert.strictEqual(decoded.scheme, 'inmemory');
		assert.strictEqual(decoded.authority, '');
		assert.strictEqual(decoded.path, '/test/file.txt');
	});

	test('preserves client ID as authority', () => {
		const wrapped = toAgentClientUri(URI.file('/foo'), 'my-client');
		assert.strictEqual(wrapped.authority, 'my-client');
	});
});
