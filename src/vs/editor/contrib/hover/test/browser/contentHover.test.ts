/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { compareBy, numberComparator } from '../../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { MarkdownHover } from '../../browser/markdownHoverParticipant.js';
import { IHoverPart } from '../../browser/hoverTypes.js';
import { TestCodeEditorInstantiationOptions, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('Content Hover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #151235: Gitlens hover shows up in the wrong place', () => {
		const text = 'just some text';
		withTestCodeEditor(text, {}, (editor) => {
			const actual = RenderedContentHover.computeHoverPositions(
				editor,
				new Range(5, 5, 5, 5),
				[<IHoverPart>{ range: new Range(4, 1, 5, 6) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(5, 5),
					showAtSecondaryPosition: new Position(5, 5)
				}
			);
		});
	});

	test('issue #95328: Hover placement with word-wrap', () => {
		const text = 'just some text';
		const opts: TestCodeEditorInstantiationOptions = { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 };
		withTestCodeEditor(text, opts, (editor) => {
			const actual = RenderedContentHover.computeHoverPositions(
				editor,
				new Range(1, 8, 1, 8),
				[<IHoverPart>{ range: new Range(1, 1, 1, 15) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(1, 8),
					showAtSecondaryPosition: new Position(1, 6)
				}
			);
		});
	});

	test('issue #320604: Loading message ordinal 0 sorts above action buttons at ordinal 1', () => {
		const anchor = new Range(1, 1, 1, 10);
		const owner = <MarkdownHover['owner']>{};

		const loading = new MarkdownHover(owner, anchor, [new MarkdownString().appendText('Loading...')], false, 0);
		const runScript = new MarkdownHover(owner, anchor, [new MarkdownString().appendText('Run Script')], false, 1);
		const debugScript = new MarkdownHover(owner, anchor, [new MarkdownString().appendText('Debug Script')], false, 1);

		// Parts arrive with buttons before loading (simulating fast npm provider, slow description)
		const parts = [runScript, debugScript, loading];
		parts.sort(compareBy(hover => hover.ordinal, numberComparator));

		assert.strictEqual(parts[0], loading, 'Loading (ordinal 0) should sort before buttons (ordinal 1)');
		assert.strictEqual(parts[1], runScript);
		assert.strictEqual(parts[2], debugScript);
	});
});
