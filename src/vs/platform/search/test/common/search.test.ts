/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TextSearchResult, OneLineRange, ITextSearchResult, ITextSearchPreviewOptions } from 'vs/platform/search/common/search';

suite('TextSearchResult', () => {

	const previewOptions1: ITextSearchPreviewOptions = {
		leadingChars: 10,
		maxLines: 1,
		totalChars: 100
	};

	test('empty', () => {
		assert.deepEqual(
			new TextSearchResult('', new OneLineRange(5, 0, 0)),
			<ITextSearchResult>{
				preview: {
					text: '',
					match: new OneLineRange(0, 0, 0)
				},
				range: new OneLineRange(5, 0, 0)
			});

		assert.deepEqual(
			new TextSearchResult('', new OneLineRange(5, 0, 0), previewOptions1),
			<ITextSearchResult>{
				preview: {
					text: '',
					match: new OneLineRange(0, 0, 0)
				},
				range: new OneLineRange(5, 0, 0)
			});
	});

	test('short', () => {
		assert.deepEqual(
			new TextSearchResult('foo bar', new OneLineRange(5, 4, 7)),
			<ITextSearchResult>{
				preview: {
					text: 'foo bar',
					match: new OneLineRange(0, 4, 7)
				},
				range: new OneLineRange(5, 4, 7)
			});

		assert.deepEqual(
			new TextSearchResult('foo bar', new OneLineRange(5, 4, 7), previewOptions1),
			<ITextSearchResult>{
				preview: {
					text: 'foo bar',
					match: new OneLineRange(0, 4, 7)
				},
				range: new OneLineRange(5, 4, 7)
			});
	});

	test('leading', () => {
		assert.deepEqual(
			new TextSearchResult('long text very long text foo', new OneLineRange(5, 25, 28), previewOptions1),
			<ITextSearchResult>{
				preview: {
					text: 'long text foo',
					match: new OneLineRange(0, 10, 13)
				},
				range: new OneLineRange(5, 25, 28)
			});
	});

	test('trailing', () => {
		assert.deepEqual(
			new TextSearchResult('foo long text very long text long text very long text long text very long text long text very long text long text very long text', new OneLineRange(5, 0, 3), previewOptions1),
			<ITextSearchResult>{
				preview: {
					text: 'foo long text very long text long text very long text long text very long text long text very long t',
					match: new OneLineRange(0, 0, 3)
				},
				range: new OneLineRange(5, 0, 3)
			});
	});

	test('middle', () => {
		assert.deepEqual(
			new TextSearchResult('long text very long text long foo text very long text long text very long text long text very long text long text very long text', new OneLineRange(5, 30, 33), previewOptions1),
			<ITextSearchResult>{
				preview: {
					text: 'text long foo text very long text long text very long text long text very long text long text very l',
					match: new OneLineRange(0, 10, 13)
				},
				range: new OneLineRange(5, 30, 33)
			});
	});
});