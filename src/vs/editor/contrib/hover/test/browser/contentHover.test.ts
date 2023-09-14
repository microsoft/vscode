/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ContentHoverController } from 'vs/editor/contrib/hover/browser/contentHover';
import { IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { TestCodeEditorInstantiationOptions, withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';

suite('Content Hover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #151235: Gitlens hover shows up in the wrong place', () => {
		const text = 'just some text';
		withTestCodeEditor(text, {}, (editor) => {
			const actual = ContentHoverController.computeHoverRanges(
				editor,
				new Range(5, 5, 5, 5),
				[<IHoverPart>{ range: new Range(4, 1, 5, 6) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(5, 5),
					showAtSecondaryPosition: new Position(5, 5),
					highlightRange: new Range(4, 1, 5, 6)
				}
			);
		});
	});

	test('issue #95328: Hover placement with word-wrap', () => {
		const text = 'just some text';
		const opts: TestCodeEditorInstantiationOptions = { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 };
		withTestCodeEditor(text, opts, (editor) => {
			const actual = ContentHoverController.computeHoverRanges(
				editor,
				new Range(1, 8, 1, 8),
				[<IHoverPart>{ range: new Range(1, 1, 1, 15) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(1, 8),
					showAtSecondaryPosition: new Position(1, 6),
					highlightRange: new Range(1, 1, 1, 15)
				}
			);
		});
	});
});
