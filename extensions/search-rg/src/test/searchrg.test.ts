/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { createTextSearchResult } from '../utils';

function createOneLineRange(lineNumber: number, startCol: number, endCol: number): vscode.Range {
	return new vscode.Range(lineNumber, startCol, lineNumber, endCol);
}

const uri = vscode.Uri.file('/foo/bar');

suite('search-rg', () => {
	const previewOptions1: vscode.TextSearchPreviewOptions = {
		leadingChars: 10,
		maxLines: 1,
		totalChars: 100
	};

	test('empty', () => {
		assert.deepEqual(
			createTextSearchResult(uri, '', createOneLineRange(5, 0, 0)),
			<vscode.TextSearchResult>{
				preview: {
					text: '',
					match: createOneLineRange(0, 0, 0)
				},
				range: createOneLineRange(5, 0, 0),
				uri
			});

		assert.deepEqual(
			createTextSearchResult(uri, '', createOneLineRange(5, 0, 0), previewOptions1),
			<vscode.TextSearchResult>{
				preview: {
					text: '',
					match: createOneLineRange(0, 0, 0)
				},
				range: createOneLineRange(5, 0, 0),
				uri
			});
	});

	test('short', () => {
		assert.deepEqual(
			createTextSearchResult(uri, 'foo bar', createOneLineRange(5, 4, 7)),
			<vscode.TextSearchResult>{
				preview: {
					text: 'foo bar',
					match: createOneLineRange(0, 4, 7)
				},
				range: createOneLineRange(5, 4, 7),
				uri
			});

		assert.deepEqual(
			createTextSearchResult(uri, 'foo bar', createOneLineRange(5, 4, 7), previewOptions1),
			<vscode.TextSearchResult>{
				preview: {
					text: 'foo bar',
					match: createOneLineRange(0, 4, 7)
				},
				range: createOneLineRange(5, 4, 7),
				uri
			});
	});

	test('leading', () => {
		assert.deepEqual(
			createTextSearchResult(uri, 'long text very long text foo', createOneLineRange(5, 25, 28), previewOptions1),
			<vscode.TextSearchResult>{
				preview: {
					text: 'long text foo',
					match: createOneLineRange(0, 10, 13)
				},
				range: createOneLineRange(5, 25, 28),
				uri
			});
	});

	test('trailing', () => {
		assert.deepEqual(
			createTextSearchResult(uri, 'foo long text very long text long text very long text long text very long text long text very long text long text very long text', createOneLineRange(5, 0, 3), previewOptions1),
			<vscode.TextSearchResult>{
				preview: {
					text: 'foo long text very long text long text very long text long text very long text long text very long t',
					match: createOneLineRange(0, 0, 3)
				},
				range: createOneLineRange(5, 0, 3),
				uri
			});
	});

	test('middle', () => {
		assert.deepEqual(
			createTextSearchResult(uri, 'long text very long text long foo text very long text long text very long text long text very long text long text very long text', createOneLineRange(5, 30, 33), previewOptions1),
			<vscode.TextSearchResult>{
				preview: {
					text: 'text long foo text very long text long text very long text long text very long text long text very l',
					match: createOneLineRange(0, 10, 13)
				},
				range: createOneLineRange(5, 30, 33),
				uri
			});
	});

	test('truncating match', () => {
		const previewOptions: vscode.TextSearchPreviewOptions = {
			leadingChars: 4,
			maxLines: 1,
			totalChars: 5
		};

		assert.deepEqual(
			createTextSearchResult(uri, 'foo bar', createOneLineRange(0, 4, 7), previewOptions),
			<vscode.TextSearchResult>{
				preview: {
					text: 'foo b',
					match: createOneLineRange(0, 4, 5)
				},
				range: createOneLineRange(0, 4, 7),
				uri
			});
	});
});