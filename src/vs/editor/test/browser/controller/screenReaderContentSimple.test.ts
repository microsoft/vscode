/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { IME } from '../../../../base/common/ime.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { SimpleScreenReaderContent } from '../../../browser/controller/editContext/native/screenReaderContentSimple.js';
import { ViewController } from '../../../browser/view/viewController.js';
import { ViewUserInputEvents } from '../../../browser/view/viewUserInputEvents.js';
import { Selection } from '../../../common/core/selection.js';
import { EndOfLineSequence } from '../../../common/model.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { testViewModel } from '../viewModel/testViewModel.js';

class TrackingViewController extends ViewController {
	public selectionCalls = 0;

	public override setSelection(selection: Selection): void {
		this.selectionCalls++;
		super.setSelection(selection);
	}
}

class ScreenReaderAccessibility extends TestAccessibilityService {
	public optimized = true;

	public override isScreenReaderOptimized(): boolean {
		return this.optimized;
	}

	public override getAccessibilitySupport(): AccessibilitySupport {
		return AccessibilitySupport.Enabled;
	}
}

interface ContentFixture {
	content: SimpleScreenReaderContent;
	target: HTMLElement;
	viewModel: ViewModel;
	controller: TrackingViewController;
	accessibility: ScreenReaderAccessibility;
	clock: ReturnType<typeof sinon.useFakeTimers>;
	disposables: DisposableStore;
}

interface FixtureOptions {
	pageSize?: number;
	eol?: EndOfLineSequence;
}

/** Exercises production content and selection mapping over the existing real model fixture. */
function withContent(lines: string[], callback: (fixture: ContentFixture) => void, options: FixtureOptions = {}): void {
	let callbackError: Error | undefined;
	testViewModel(lines, { accessibilitySupport: 'on', accessibilityPageSize: options.pageSize ?? 10 }, (viewModel, model, configuration) => {
		const disposables = new DisposableStore();
		const imeWasEnabled = IME.enabled;
		try {
			// Only Date is faked. Browser DOM tasks are neither advanced nor replaced.
			const clock = sinon.useFakeTimers({ now: 1000, toFake: ['Date'] });
			disposables.add(toDisposable(() => clock.restore()));
			if (!imeWasEnabled) {
				IME.enable();
			}
			if (options.eol !== undefined) {
				model.setEOL(options.eol);
			}
			const controller = new TrackingViewController(configuration, viewModel,
				new ViewUserInputEvents(viewModel.coordinatesConverter), {
					paste: () => { }, type: () => { }, compositionType: () => { },
					startComposition: () => { }, endComposition: () => { }, cut: () => { }
				});
			const target = document.createElement('div');
			target.contentEditable = 'true';
			target.tabIndex = 0;
			const accessibility = new ScreenReaderAccessibility();
			const content = disposables.add(new SimpleScreenReaderContent(createFastDomNode(target),
				new ViewContext(configuration, new TestColorTheme(), viewModel), controller, accessibility));
			disposables.add(toDisposable(() => target.remove()));
			document.body.appendChild(target);
			target.focus();
			viewModel.setHasFocus(true);
			const end = model.getFullModelRange().getEndPosition();
			controller.setSelection(new Selection(end.lineNumber, end.column, end.lineNumber, end.column));
			content.onFocusChange(true);
			content.updateScreenReaderContent(viewModel.getSelections()[0]);
			controller.selectionCalls = 0;
			callback({ content, target, viewModel, controller, accessibility, clock, disposables });
		} catch (error) {
			// Return normally so testViewModel also disposes its model on an assertion failure.
			callbackError = error instanceof Error ? error : new Error(String(error));
		} finally {
			disposables.dispose();
			if (IME.enabled !== imeWasEnabled) {
				if (imeWasEnabled) {
					IME.enable();
				} else {
					IME.disable();
				}
			}
		}
	});
	if (callbackError) {
		throw callbackError;
	}
}

function render(context: ContentFixture): void {
	context.content.updateScreenReaderContent(context.viewModel.getSelections()[0]);
}

/** DOM and editor offsets use UTF-16; AT-SPI code-point conversion is a separate layer. */
function select(context: ContentFixture, anchor: number, focus: number = anchor): void {
	const node = context.target.firstChild!;
	context.target.ownerDocument.getSelection()!.setBaseAndExtent(node, anchor, node, focus);
}

/** Delivers one source-listener event synchronously, before a queued browser render can run. */
function dispatchSelectionChange(context: ContentFixture): void {
	context.target.ownerDocument.dispatchEvent(new Event('selectionchange'));
}

function observe({ target, viewModel }: ContentFixture) {
	const selection = target.ownerDocument.getSelection()!;
	const editor = viewModel.getSelections()[0];
	return {
		inTarget: selection.anchorNode === target.firstChild && selection.focusNode === target.firstChild,
		anchor: selection.anchorOffset,
		focus: selection.focusOffset,
		editor: [editor.selectionStartLineNumber, editor.selectionStartColumn, editor.positionLineNumber, editor.positionColumn]
	};
}

suite('SimpleScreenReaderContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const fixture of [
		{ name: 'ASCII', lines: ['lrd code text'], offset: 1, editor: [1, 2, 1, 2] },
		{ name: 'supplementary Unicode', lines: ['a\u{1f642}\u{1d11e} caf\u00e9 omega'], offset: 3, editor: [1, 4, 1, 4] },
		{ name: 'multiline Unicode', lines: ['alpha\u{1f642}', 'bravo\u{1d11e}', 'charlie\u{10437}'], offset: 9, editor: [2, 2, 2, 2] }
	]) {
		test(`preserves a pending system caret through an unchanged ${fixture.name} render`, () => {
			withContent(fixture.lines, context => {
				select(context, fixture.offset);
				// Reproduce the model render preceding delivery of selectionchange.
				render(context);
				dispatchSelectionChange(context);
				assert.deepStrictEqual(observe(context), {
					inTarget: true, anchor: fixture.offset, focus: fixture.offset, editor: fixture.editor
				});
			});
		});
	}

	test('accepts an external caret immediately after its own selection write', () => {
		withContent(['lrd code text'], context => {
			select(context, 1);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ state: observe(context), calls: context.controller.selectionCalls }, {
				state: { inTarget: true, anchor: 1, focus: 1, editor: [1, 2, 1, 2] }, calls: 1
			});
		});
	});

	test('accepts two distinct external caret events one millisecond apart', () => {
		withContent(['lrd code text'], context => {
			// Leave the old own-write suppression window, then exercise its separate burst filter.
			context.clock.tick(200);
			select(context, 1);
			dispatchSelectionChange(context);
			const first = observe(context);
			context.clock.tick(1);
			select(context, 2);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ first, second: observe(context), calls: context.controller.selectionCalls }, {
				first: { inTarget: true, anchor: 1, focus: 1, editor: [1, 2, 1, 2] },
				second: { inTarget: true, anchor: 2, focus: 2, editor: [1, 3, 1, 3] },
				calls: 2
			});
		});
	});

	test('accepts a system-caret return to the original offset without an intervening render', () => {
		withContent(['lrd code text'], context => {
			// Last renderer-owned caret is 13. Updating the model at 1 does not
			// itself update the cached page mapping or trigger another render.
			select(context, 1);
			dispatchSelectionChange(context);
			const first = observe(context);
			select(context, 13);
			dispatchSelectionChange(context);
			const second = observe(context);
			// The second external request must not be mistaken for the original
			// renderer-owned selection, even though its offset is also 13.
			assert.deepStrictEqual({ first, second, calls: context.controller.selectionCalls }, {
				first: { inTarget: true, anchor: 1, focus: 1, editor: [1, 2, 1, 2] },
				second: { inTarget: true, anchor: 13, focus: 13, editor: [1, 14, 1, 14] },
				calls: 2
			});
			render(context);
			assert.deepStrictEqual(observe(context), second);
		});
	});

	test('does not send a delayed renderer-owned selection back to the model', () => {
		withContent(['lrd code text'], context => {
			context.clock.tick(200);
			dispatchSelectionChange(context);
			render(context);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ state: observe(context), calls: context.controller.selectionCalls }, {
				state: { inTarget: true, anchor: 13, focus: 13, editor: [1, 14, 1, 14] }, calls: 0
			});
		});
	});

	test('renders a changed model selection without feeding its write back', () => {
		withContent(['lrd code text'], context => {
			select(context, 1);
			context.controller.setSelection(new Selection(1, 5, 1, 5));
			render(context);
			context.clock.tick(200);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ state: observe(context), calls: context.controller.selectionCalls }, {
				state: { inTarget: true, anchor: 4, focus: 4, editor: [1, 5, 1, 5] }, calls: 1
			});
		});
	});

	test('restores the model selection when focus returns from another control', () => {
		withContent(['lrd code text'], context => {
			const control = document.createElement('button');
			context.disposables.add(toDisposable(() => control.remove()));
			control.textContent = 'other control';
			document.body.appendChild(control);
			context.content.onFocusChange(false);
			context.viewModel.setHasFocus(false);
			control.focus();
			document.getSelection()!.collapse(control.firstChild!, 1);
			context.target.focus();
			context.viewModel.setHasFocus(true);
			context.content.onFocusChange(true);
			render(context);
			assert.deepStrictEqual(observe(context), {
				inTarget: true, anchor: 13, focus: 13, editor: [1, 14, 1, 14]
			});
		});
	});

	test('preserves the direction of an external reversed supplementary selection', () => {
		withContent(['a\u{1f642}\u{1d11e} caf\u00e9 omega'], context => {
			select(context, 5, 1);
			dispatchSelectionChange(context);
			assert.deepStrictEqual(observe(context), {
				inTarget: true, anchor: 5, focus: 1, editor: [1, 6, 1, 2]
			});
		});
	});

	test('maps reversed multiline DOM offsets to a real CRLF model', () => {
		withContent(['a\u{1f642}', 'b\u{1d11e}', 'c\u{10437}'], context => {
			select(context, 9, 1);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ text: context.target.textContent, state: observe(context) }, {
				text: 'a\u{1f642}\nb\u{1d11e}\nc\u{10437}',
				state: { inTarget: true, anchor: 9, focus: 1, editor: [3, 2, 1, 2] }
			});
		}, { eol: EndOfLineSequence.CRLF });
	});

	test('maps an external caret within a page that starts after the first model line', () => {
		withContent(['zero', 'one', 'two', 'three', 'four', 'five'], context => {
			select(context, 6);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ text: context.target.textContent, state: observe(context) }, {
				text: 'four\nfive',
				state: { inTarget: true, anchor: 6, focus: 6, editor: [6, 2, 6, 2] }
			});
		}, { pageSize: 2 });
	});

	test('writes a changed page mapping even when page text and selection offsets match', () => {
		withContent(['same', 'same', 'same', 'same', 'same'], context => {
			context.controller.setSelection(new Selection(4, 5, 4, 5));
			render(context);
			const previousText = context.target.textContent;
			select(context, 1);
			context.controller.setSelection(new Selection(3, 5, 3, 5));
			render(context);
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ previousText, text: context.target.textContent, state: observe(context) }, {
				previousText: 'same\n',
				text: 'same\n',
				state: { inTarget: true, anchor: 4, focus: 4, editor: [3, 5, 3, 5] }
			});
		}, { pageSize: 1 });
	});

	test('ignores external selection while IME is disabled and accepts it after re-enabling', () => {
		withContent(['lrd code text'], context => {
			context.clock.tick(200);
			IME.disable();
			select(context, 1);
			dispatchSelectionChange(context);
			const whileDisabled = observe(context);
			IME.enable();
			dispatchSelectionChange(context);
			assert.deepStrictEqual({ whileDisabled, afterEnabled: observe(context), calls: context.controller.selectionCalls }, {
				whileDisabled: { inTarget: true, anchor: 1, focus: 1, editor: [1, 14, 1, 14] },
				afterEnabled: { inTarget: true, anchor: 1, focus: 1, editor: [1, 2, 1, 2] },
				calls: 1
			});
		});
	});

	test('does not discard a system-caret request immediately after clipboard hooks', () => {
		withContent(['lrd code text'], context => {
			context.clock.tick(200);
			context.content.onWillCut();
			context.content.onWillPaste();
			select(context, 1);
			dispatchSelectionChange(context);
			assert.deepStrictEqual(observe(context), {
				inTarget: true, anchor: 1, focus: 1, editor: [1, 2, 1, 2]
			});
		});
	});

	test('clears owned content and stops model updates when screen-reader optimization is disabled', () => {
		withContent(['lrd code text'], context => {
			context.accessibility.optimized = false;
			render(context);
			dispatchSelectionChange(context);
			const selection = context.viewModel.getSelections()[0];
			assert.deepStrictEqual({
				text: context.target.textContent,
				calls: context.controller.selectionCalls,
				editor: [selection.positionLineNumber, selection.positionColumn]
			}, { text: '', calls: 0, editor: [1, 14] });
		});
	});
});
