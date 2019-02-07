/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI as uri } from 'vs/base/common/uri';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { normalize } from 'vs/base/common/paths';

suite('Debug - Source', () => {

	test('from raw source', () => {
		const source = new Source({
			name: 'zz',
			path: '/xx/yy/zz',
			sourceReference: 0,
			presentationHint: 'emphasize'
		}, 'aDebugSessionId');

		assert.equal(source.presentationHint, 'emphasize');
		assert.equal(source.name, 'zz');
		assert.equal(source.inMemory, false);
		assert.equal(source.reference, 0);
		assert.equal(source.uri.toString(), uri.file('/xx/yy/zz').toString());
	});

	test('from raw internal source', () => {
		const source = new Source({
			name: 'internalModule.js',
			sourceReference: 11,
			presentationHint: 'deemphasize'
		}, 'aDebugSessionId');

		assert.equal(source.presentationHint, 'deemphasize');
		assert.equal(source.name, 'internalModule.js');
		assert.equal(source.inMemory, true);
		assert.equal(source.reference, 11);
		assert.equal(source.uri.toString(), 'debug:internalModule.js?session%3DaDebugSessionId%26ref%3D11');
	});

	test('get encoded debug data', () => {
		const checkData = (uri: uri, expectedName, expectedPath, expectedSourceReference, expectedSessionId) => {
			let { name, path, sourceReference, sessionId } = Source.getEncodedDebugData(uri);
			assert.equal(name, expectedName);
			assert.equal(path, expectedPath);
			assert.equal(sourceReference, expectedSourceReference);
			assert.equal(sessionId, expectedSessionId);
		};

		checkData(uri.file('a/b/c/d'), 'd', normalize('/a/b/c/d', true), undefined, undefined);
		checkData(uri.from({ scheme: 'file', path: '/my/path/test.js', query: 'ref=1&session=2' }), 'test.js', normalize('/my/path/test.js', true), undefined, undefined);

		checkData(uri.from({ scheme: 'http', authority: 'www.msft.com', path: '/my/path' }), 'path', 'http://www.msft.com/my/path', undefined, undefined);
		checkData(uri.from({ scheme: 'debug', authority: 'www.msft.com', path: '/my/path', query: 'ref=100' }), 'path', '/my/path', 100, undefined);
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d.js', query: 'session=100' }), 'd.js', 'a/b/c/d.js', undefined, 100);
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d/foo.txt', query: 'session=100&ref=10' }), 'foo.txt', 'a/b/c/d/foo.txt', 10, 100);
	});
});
