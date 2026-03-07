/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI, UriComponents } from '../../common/uri.js';
import { IURITransformer, transformOutgoingURIs } from '../../common/uriIpc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('URI IPC', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const transformer: IURITransformer = {
		transformIncoming: (uri: UriComponents) => uri,
		transformOutgoing: (uri: UriComponents) => {
			return {
				...uri,
				scheme: uri.scheme === 'file' ? 'vscode-file' : uri.scheme
			};
		},
		transformOutgoingURI: (uri: URI) => uri.with({ scheme: uri.scheme === 'file' ? 'vscode-file' : uri.scheme }),
		transformOutgoingScheme: (scheme: string) => scheme === 'file' ? 'vscode-file' : scheme
	};

	test('transformOutgoingURIs - simple URI', () => {
		const uri = URI.parse('file://server/path');
		const result = transformOutgoingURIs(uri, transformer);
		assert.strictEqual((result as any).scheme, 'vscode-file');
	});

	test('transformOutgoingURIs - object with URI', () => {
		const obj = {
			name: 'test',
			uri: URI.parse('file://server/path')
		};
		const result = transformOutgoingURIs(obj, transformer);
		assert.strictEqual(result.name, 'test');
		assert.strictEqual((result.uri as any).scheme, 'vscode-file');
	});

	test('transformOutgoingURIs - array with URI', () => {
		const arr = ['test', URI.parse('file://server/path')];
		const result = transformOutgoingURIs(arr, transformer);
		assert.strictEqual(result[0], 'test');
		assert.strictEqual((result[1] as any).scheme, 'vscode-file');
	});

	test('transformOutgoingURIs - nested object with URI', () => {
		const obj = {
			name: 'test',
			nested: {
				uri: URI.parse('file://server/path')
			}
		};
		const result = transformOutgoingURIs(obj, transformer);
		assert.strictEqual(result.name, 'test');
		assert.strictEqual((result.nested.uri as any).scheme, 'vscode-file');
	});

	test('transformOutgoingURIs - max depth limit', () => {
		// Create an object deeper than 200 levels
		let obj: any = {};
		let current = obj;
		for (let i = 0; i < 205; i++) {
			current.nested = {};
			current = current.nested;
		}
		current.uri = URI.parse('file://server/path');

		// The transformer modifies in place for objects/arrays.
		// Since it exceeds depth 200, the nested URI should NOT be transformed.
		const result = transformOutgoingURIs(obj, transformer);

		let deepest = result;
		for (let i = 0; i < 205; i++) {
			deepest = deepest.nested;
		}

		// The original scheme should remain, meaning it wasn't transformed.
		assert.strictEqual((deepest.uri as any).scheme, 'file');
	});

	test('transformOutgoingURIs - no change returns same object', () => {
		const obj = {
			name: 'test',
			value: 123
		};
		const result = transformOutgoingURIs(obj, transformer);
		assert.strictEqual(result, obj);
	});
});
