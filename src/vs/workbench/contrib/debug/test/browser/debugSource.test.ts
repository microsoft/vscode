/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { NullLogService } from 'vs/platform/log/common/log';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { mockUriIdentityService } from 'vs/workbench/contrib/debug/test/browser/mockDebugModel';

suite('Debug - Source', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('from raw source', () => {
		const source = new Source({
			name: 'zz',
			path: '/xx/yy/zz',
			sourceReference: 0,
			presentationHint: 'emphasize'
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());

		assert.strictEqual(source.presentationHint, 'emphasize');
		assert.strictEqual(source.name, 'zz');
		assert.strictEqual(source.inMemory, false);
		assert.strictEqual(source.reference, 0);
		assert.strictEqual(source.uri.toString(), uri.file('/xx/yy/zz').toString());
	});

	test('from raw internal source', () => {
		const source = new Source({
			name: 'internalModule.js',
			sourceReference: 11,
			presentationHint: 'deemphasize'
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());

		assert.strictEqual(source.presentationHint, 'deemphasize');
		assert.strictEqual(source.name, 'internalModule.js');
		assert.strictEqual(source.inMemory, true);
		assert.strictEqual(source.reference, 11);
		assert.strictEqual(source.uri.toString(), 'debug:internalModule.js?session%3DaDebugSessionId%26ref%3D11');
	});

	test('get encoded debug data', () => {
		const checkData = (uri: uri, expectedName: string, expectedPath: string, expectedSourceReference: number | undefined, expectedSessionId?: string) => {
			const { name, path, sourceReference, sessionId } = Source.getEncodedDebugData(uri);
			assert.strictEqual(name, expectedName);
			assert.strictEqual(path, expectedPath);
			assert.strictEqual(sourceReference, expectedSourceReference);
			assert.strictEqual(sessionId, expectedSessionId);
		};

		checkData(uri.file('a/b/c/d'), 'd', isWindows ? '\\a\\b\\c\\d' : '/a/b/c/d', undefined, undefined);
		checkData(uri.from({ scheme: 'file', path: '/my/path/test.js', query: 'ref=1&session=2' }), 'test.js', isWindows ? '\\my\\path\\test.js' : '/my/path/test.js', undefined, undefined);

		checkData(uri.from({ scheme: 'http', authority: 'www.example.com', path: '/my/path' }), 'path', 'http://www.example.com/my/path', undefined, undefined);
		checkData(uri.from({ scheme: 'debug', authority: 'www.example.com', path: '/my/path', query: 'ref=100' }), 'path', '/my/path', 100, undefined);
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d.js', query: 'session=100' }), 'd.js', 'a/b/c/d.js', undefined, '100');
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d/foo.txt', query: 'session=100&ref=10' }), 'foo.txt', 'a/b/c/d/foo.txt', 10, '100');
	});
});
