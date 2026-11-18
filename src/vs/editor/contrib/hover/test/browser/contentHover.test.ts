/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { HoverRangeAnchor, IEditorHoverContext, IEditorHoverParticipant, IHoverPart, RenderedHoverParts } from '../../browser/hoverTypes.js';
import { ContentHoverResult } from '../../browser/contentHoverTypes.js';
import { HoverStartSource } from '../../browser/hoverOperation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { TestCodeEditorInstantiationOptions, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('Content Hover', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('rendered hover owns content, metadata, focus listeners and decorations', () => {
		withTestCodeEditor('hover text', {}, (editor, _viewModel, instantiationService) => {
			let disposedParts = 0;
			const participant: IEditorHoverParticipant = {
				hoverOrdinal: 0,
				hideCopyButton: true,
				computeSync: () => [],
				getAccessibleContent: () => 'Accessible hover text',
				renderHoverParts: (context, parts) => new RenderedHoverParts(parts.map(hoverPart => {
					const hoverElement = document.createElement('div');
					hoverElement.tabIndex = 0;
					hoverElement.textContent = 'Rendered hover text';
					context.fragment.appendChild(hoverElement);
					return { hoverPart, hoverElement, dispose: () => disposedParts++ };
				}))
			};
			const range = new Range(1, 1, 1, 6);
			const part: IHoverPart = { owner: participant, range, isBeforeContent: true, isValidForHoverAnchor: () => true };
			const result = new ContentHoverResult([part], true, {
				anchor: new HoverRangeAnchor(0, range, 10, 20),
				shouldFocus: true,
				source: HoverStartSource.Keyboard,
				insistOnKeepingHoverVisible: false
			});
			const context: IEditorHoverContext = {
				onContentsChanged: () => {}, setMinimumDimensions: () => {}, hide: () => {}, focus: () => {}
			};
			const hover = store.add(instantiationService.createInstance(RenderedContentHover, editor, result, [participant], context));
			const container = document.createElement('div');
			container.appendChild(hover.domNode);
			document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			hover.focusHoverPartWithIndex(0);
			assert.deepStrictEqual({
				metadata: hover.metadata,
				mouse: [hover.initialMousePosX, hover.initialMousePosY],
				text: container.textContent,
				accessible: hover.getAccessibleWidgetContent(),
				part: hover.getAccessibleWidgetContentAtIndex(0),
				count: hover.hoverPartsCount,
				focused: hover.focusedHoverPartIndex
			}, {
				metadata: { showAtPosition: new Position(1, 1), showAtSecondaryPosition: new Position(1, 1), shouldFocus: true, source: HoverStartSource.Keyboard, shouldAppearBeforeContent: true },
				mouse: [10, 20],
				text: 'Rendered hover text',
				accessible: 'Accessible hover text',
				part: 'Accessible hover text',
				count: 1,
				focused: 0
			});
			hover.dispose();
			assert.deepStrictEqual({ disposedParts, decorations: editor.getModel()!.getAllDecorations().filter(decoration => decoration.options.description === 'content-hover-highlight').length }, { disposedParts: 1, decorations: 0 });
		});
	});

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
});
