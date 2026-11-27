/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import type * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { UriList, uriListMimeType } from '../dropOrPaste/uriList';

suite('CSS URI lists', () => {
	const first = 'file:///project/first.png';
	const second = 'file:///project/second.png';

	for (const separator of ['\r\n', '\n', '\r']) {
		test(`accepts ${JSON.stringify(separator)} line endings and ignores trailing empty lines`, () => {
			const value = [first, second, '', ''].join(separator);
			assert.deepStrictEqual(UriList.from(value).entries.map(entry => entry.str), [first, second]);
		});
	}

	test('ignores comments, blank lines, and surrounding whitespace', () => {
		const value = `# Header\r\n  ${first}  \n\n  # Another comment\n\t${second}\r\n`;
		assert.deepStrictEqual(UriList.from(value).entries.map(entry => entry.str), [first, second]);
	});

	test('ignores entries without a URI scheme', () => {
		const value = ['relative.png', '/absolute/path.png', first, '//example.com/image.png'].join('\n');
		assert.deepStrictEqual(UriList.from(value).entries.map(entry => entry.str), [first]);
	});

	test('preserves original query and fragment encoding', () => {
		const value = 'https://example.com/image.svg?x=1&label=a%26b#icon';
		assert.deepStrictEqual(UriList.from(value).entries.map(entry => ({
			str: entry.str,
			path: entry.uri.path,
			fragment: entry.uri.fragment,
		})), [{ str: value, path: '/image.svg', fragment: 'icon' }]);
	});

	test('keeps different fragments and queries while removing duplicate entries', () => {
		const value = [first, first + '#one', first, first + '?size=2', second].join('\n');
		assert.deepStrictEqual(UriList.from(value).entries.map(entry => entry.str), [first, first + '#one', first + '?size=2', second]);
	});

	test('empty and comment-only URI lists contain no resources', () => {
		assert.deepStrictEqual(['', '\r\n', ' \n\t', '# Comment\n'].map(value => UriList.from(value).entries.length), [0, 0, 0, 0]);
	});

	suite('data transfers', () => {
		function textItem(value: string): vscode.DataTransferItem {
			return { value, asString: async () => value, asFile: () => undefined };
		}

		function fileItem(uri: URI | undefined): vscode.DataTransferItem {
			return {
				value: undefined,
				asString: async () => '',
				asFile: () => ({ name: 'image.png', uri, data: async () => new Uint8Array() }),
			};
		}

		test('prefers the URI list to file entries', async () => {
			const dataTransfer = new Map<string, vscode.DataTransferItem>([
				[uriListMimeType, textItem(first)],
				['image/png', fileItem(URI.parse(second))],
			]);
			assert.deepStrictEqual((await UriList.fromDataTransfer(dataTransfer)).entries.map(entry => entry.str), [first]);
		});

		for (const value of ['', '# Comment\r\n', 'not a URI']) {
			test(`falls back to files when the URI list is ${JSON.stringify(value)}`, async () => {
				const dataTransfer = new Map<string, vscode.DataTransferItem>([
					[uriListMimeType, textItem(value)],
					['image/png', fileItem(URI.parse(first))],
				]);
				assert.deepStrictEqual((await UriList.fromDataTransfer(dataTransfer)).entries.map(entry => entry.str), [first]);
			});
		}

		test('ignores file items without URIs and ordinary text', async () => {
			const dataTransfer = new Map<string, vscode.DataTransferItem>([
				['image/png', fileItem(undefined)],
				['text/plain', textItem(first)],
			]);
			assert.deepStrictEqual((await UriList.fromDataTransfer(dataTransfer)).entries, []);
		});

		test('deduplicates file URIs and encodes literal URL delimiters in filenames', async () => {
			const uri = URI.file('/project/image#one?.png');
			const dataTransfer = new Map<string, vscode.DataTransferItem>([
				['image/png', fileItem(uri)],
				['application/octet-stream', fileItem(uri)],
			]);
			assert.deepStrictEqual((await UriList.fromDataTransfer(dataTransfer)).entries.map(entry => entry.str), ['file:///project/image%23one%3F.png']);
		});
	});
});
