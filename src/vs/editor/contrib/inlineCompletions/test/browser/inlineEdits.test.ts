/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getColorRegistry } from '../../../../../platform/theme/common/colorRegistry.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { Position } from '../../../../common/core/position.js';
import { TextModelValueReference } from '../../browser/model/textModelValueReference.js';
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../browser/view/inlineEdits/components/gutterIndicatorView.js';
import { LongDistancePreviewEditor } from '../../browser/view/inlineEdits/inlineEditsViews/longDistanceHint/longDistancePreviewEditor.js';
import { InlineEditTabAction } from '../../browser/view/inlineEdits/inlineEditsViewInterface.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { InlineEditsOnboardingExperience } from '../../browser/view/inlineEdits/inlineEditsNewUsers.js';
import { InlineSuggestionsView } from '../../browser/view/inlineSuggestionsView.js';
import { AnnotatedText, InlineEditContext, IWithAsyncTestCodeEditorAndInlineCompletionsModel, MockInlineCompletionsProvider, MockSearchReplaceCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from './utils.js';

suite('Inline Edits', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	for (const showInlineEditMenu of [false, true, undefined]) {
		test(`inline edit gutter menu: ${showInlineEditMenu}`, async () => {
			const provider = new MockInlineCompletionsProvider();
			const didShow = new DeferredPromise<void>();
			sinon.stub(provider, 'handleItemDidShow').callsFake(() => { void didShow.complete(); });
			provider.setReturnValue({ insertText: 'replacement', isInlineEdit: true, showInlineEditMenu });
			await withAsyncTestCodeEditorAndInlineCompletionsModel('original',
				{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
				async ({ model, editor, instantiationService, store }) => {
					await model.trigger();
					await timeout(10000);
					sinon.stub(editor, 'getContainerDomNode').returns(document.createElement('div'));
					const theme = new TestColorTheme();
					sinon.stub(theme, 'getColor').callsFake(color => getColorRegistry().resolveDefaultColor(color, theme));
					sinon.stub(instantiationService.get(IThemeService), 'getColorTheme').returns(theme);
					instantiationService.stubInstance(InlineEditsOnboardingExperience, { dispose() { } });
					const isHovered = observableValue('hover', false);
					sinon.stub(instantiationService.get(IUserInteractionService), 'createHoverTracker').returns(isHovered);
					sinon.stub(instantiationService.get(IAccessibilityService), 'isMotionReduced').returns(false);
					const addOverlayWidget = sinon.spy(editor, 'addOverlayWidget');
					store.add(new InlineSuggestionsView(editor, constObservable(model), observableValue('focus', false), instantiationService));
					assert.strictEqual(model.state.get()?.kind, 'inlineEdit');
					const indicator = addOverlayWidget.args.map(([widget]) => widget.getDomNode())
						.find(node => node.classList.contains('inline-edits-view-gutter-indicator'));
					assert.ok(indicator);
					assert.strictEqual(indicator.querySelector('.icon') !== null, showInlineEditMenu !== false);
					if (showInlineEditMenu === false) {
						isHovered.set(true, undefined);
						await timeout(200);
						assert.strictEqual(indicator.querySelector('.icon'), null);
					}
					// The view reports the shown edit through a postMessage callback.
					await didShow.p;
				}
			);
		});
	}

	for (const showInlineEditMenu of [false, true, undefined]) {
		test(`long-distance preview gutter menu: ${showInlineEditMenu}`, async () => {
			const provider = new MockInlineCompletionsProvider();
			provider.setReturnValue({ insertText: 'replacement', isInlineEdit: true, showInlineEditMenu });
			await withAsyncTestCodeEditorAndInlineCompletionsModel('original\n'.repeat(60),
				{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
				async ({ model, editor, instantiationService, store }) => {
					await model.trigger();
					await timeout(10000);
					sinon.stub(editor, 'getContainerDomNode').returns(document.createElement('div'));
					const theme = new TestColorTheme();
					sinon.stub(theme, 'getColor').callsFake(color => getColorRegistry().resolveDefaultColor(color, theme));
					sinon.stub(instantiationService.get(IThemeService), 'getColorTheme').returns(theme);
					const state = model.state.get();
					assert.strictEqual(state?.kind, 'inlineEdit');
					const textModel = editor.getModel()!;
					const preview = store.add(instantiationService.createInstance(LongDistancePreviewEditor,
						textModel,
						constObservable({
							nextCursorPosition: new Position(50, 1),
							diff: [],
							model: SimpleInlineSuggestModel.fromInlineCompletionModel(model),
							inlineSuggestInfo: InlineSuggestionGutterMenuData.fromInlineSuggestion(state.inlineSuggestion),
							showInlineEditMenu,
							target: TextModelValueReference.snapshot(textModel),
						}),
						editor,
						constObservable(InlineEditTabAction.Jump),
					));
					try {
						assert.strictEqual(preview.previewEditor.getModel(), textModel);
						const indicator = preview.previewEditor.getDomNode()!.querySelector('.inline-edits-view-gutter-indicator');
						assert.ok(indicator);
						assert.strictEqual(indicator.querySelector('.icon') !== null, showInlineEditMenu !== false);
					} finally {
						preview.dispose();
					}
				}
			);
		});
	}

	const val = new AnnotatedText(`
class Point {
	constructor(public x: number, public y: number) {}

	getLength2D(): number {
		return↓ Math.sqrt(this.x * this.x + this.y * this.y↓);
	}

	getJson(): string {
		return ↓Ü;
	}
}
`);

	async function runTest(cb: (ctx: IWithAsyncTestCodeEditorAndInlineCompletionsModel, provider: MockSearchReplaceCompletionsProvider, view: InlineEditContext) => Promise<void>): Promise<void> {
		const provider = new MockSearchReplaceCompletionsProvider();
		await withAsyncTestCodeEditorAndInlineCompletionsModel(val.value,
			{ fakeClock: true, provider, inlineSuggest: { enabled: true } },
			async (ctx) => {
				const view = new InlineEditContext(ctx.model, ctx.editor);
				ctx.store.add(view);
				await cb(ctx, provider, view);
			}
		);
	}

	test('Can Accept Inline Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);

			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			model.accept();

			assert.deepStrictEqual(editor.getValue(), `
class Point {
	constructor(public x: number, public y: number) {}

	getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	getJson(): string {
		return Ü;
	}
}
`);
		});
	});

	test('Can Type Inline Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			editor.setPosition(val.getMarkerPosition(1));
			editorViewModel.type(' + t');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...this.y + t❰his.z...his.z❱);\n'
			]));

			editorViewModel.type('his.z * this.z');
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...'
			]));
		});
	});

	test('Inline Edit Is Correctly Shifted When Typing', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add('Ü', '{x: this.x, y: this.y}');
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'...\n\t\treturn ❰Ü↦{x: t...is.y}❱;\n'
			]));
			editor.setPosition(val.getMarkerPosition(2));
			editorViewModel.type('{');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'...\t\treturn {❰Ü↦x: th...is.y}❱;\n'
			]));
		});
	});

	test('Inline Edit Stays On Unrelated Edit', async function () {
		await runTest(async ({ context, model, editor, editorViewModel }, provider, view) => {
			provider.add(`getLength2D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}`, `getLength3D(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}`);
			await model.trigger();
			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined,
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			editor.setPosition(val.getMarkerPosition(0));
			editorViewModel.type('/* */');

			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				'\n\tget❰Length2↦Length3❱D(): numbe...\n...y * this.y❰ + th...his.z❱);\n'
			]));

			await timeout(10000);
			assert.deepStrictEqual(view.getAndClearViewStates(), ([
				undefined
			]));
		});
	});
});
