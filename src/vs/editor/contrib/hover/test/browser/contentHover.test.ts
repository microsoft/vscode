/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { IHoverPart } from '../../browser/hoverTypes.js';
import { TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ContentHoverWidget } from '../../browser/contentHoverWidget.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { getWindow } from '../../../../../base/browser/dom.js';

suite('Content Hover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a delayed first reveal and a reopened hover start entrance motion, but visible updates do not', async () => {
		await withAsyncTestCodeEditor('hover target', {}, async (editor, _viewModel, instantiationService) => {
			const widget = instantiationService.createInstance(ContentHoverWidget, editor);
			const widgetNode = widget.getDomNode();
			document.body.appendChild(widgetNode);
			const hover = widgetNode.querySelector('.monaco-hover')!;
			const nextFrame = () => new Promise<void>(resolve => getWindow(widgetNode).requestAnimationFrame(() => resolve()));
			const rendered = () => new class extends mock<RenderedContentHover>() {
				override readonly showAtPosition = new Position(1, 1);
				override readonly showAtSecondaryPosition = new Position(1, 1);
				override get domNode(): DocumentFragment {
					const fragment = document.createDocumentFragment();
					fragment.appendChild(document.createTextNode('Hover content'));
					return fragment;
				}
				override dispose(): void { }
			}();
			try {
				await nextFrame();
				const initiallyHidden = hover.classList.contains('hidden');
				widget.show(rendered());
				const firstReveal = hover.classList.contains('fade-in');
				await Promise.all(hover.getAnimations().map(animation => animation.finished));
				await nextFrame();
				widget.show(rendered());
				const visibleUpdate = hover.classList.contains('fade-in');
				widget.hide();
				widget.show(rendered());
				assert.deepStrictEqual({
					initiallyHidden, firstReveal, visibleUpdate, reopened: hover.classList.contains('fade-in'),
				}, { initiallyHidden: true, firstReveal: true, visibleUpdate: false, reopened: true });
			} finally {
				widget.dispose();
				widgetNode.remove();
			}
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
