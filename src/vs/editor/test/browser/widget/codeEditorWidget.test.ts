/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IFocusTracker } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { CodeEditorWidget } from '../../../browser/widget/codeEditor/codeEditorWidget.js';
// Loaded for its side effect: the diff editor stylesheet declares `cursor` with `!important`,
// which the hidden mouse pointer state has to win against.
import '../../../browser/widget/diffEditor/style.css';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { Handler } from '../../../common/editorCommon.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices, withTestCodeEditor } from '../testCodeEditor.js';

suite('CodeEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('hideMouseCursorOnTyping', () => {

		const HIDDEN_CLASS_NAME = 'monaco-editor-hide-mouse-cursor';

		class TestFocusTracker extends Disposable implements IFocusTracker {
			private readonly _onDidFocus = this._register(new Emitter<void>());
			readonly onDidFocus = this._onDidFocus.event;
			private readonly _onDidBlur = this._register(new Emitter<void>());
			readonly onDidBlur = this._onDidBlur.event;
			refreshState(): void { }
			fireFocus(): void { this._onDidFocus.fire(); }
			fireBlur(): void { this._onDidBlur.fire(); }
		}

		/**
		 * The editor tracks focus through {@link IUserInteractionService}, which lets tests drive
		 * focus changes without depending on the test host actually owning the keyboard focus.
		 */
		class TestUserInteractionService extends MockUserInteractionService {
			private _focusTracker: TestFocusTracker | undefined;

			get focusTracker(): TestFocusTracker {
				assert.ok(this._focusTracker, 'the editor should track focus of its container');
				return this._focusTracker;
			}

			override createDomFocusTracker(): IFocusTracker {
				return this._focusTracker = new TestFocusTracker();
			}
		}

		function createEditor(options: IEditorOptions = { hideMouseCursorOnTyping: true }) {
			const services = new ServiceCollection();
			const userInteractionService = new TestUserInteractionService();
			services.set(IUserInteractionService, userInteractionService);
			const instantiationService = createCodeEditorServices(disposables, services);

			const container = document.createElement('div');
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));

			const editor = disposables.add(instantiationService.createInstance(
				CodeEditorWidget,
				container,
				options,
				{ contributions: [] }
			));
			editor.setModel(disposables.add(instantiateTextModel(instantiationService, 'hello world')));

			const isHidden = () => container.classList.contains(HIDDEN_CLASS_NAME);
			const type = (text: string = 'a', source: string = 'keyboard') => editor.trigger(source, Handler.Type, { text });
			const typeAndAssertHidden = () => {
				type();
				assert.strictEqual(isHidden(), true, 'the mouse pointer should be hidden after typing');
			};

			return { instantiationService, userInteractionService, container, editor, isHidden, type, typeAndAssertHidden };
		}

		test('is off by default', () => {
			const { isHidden, type } = createEditor({});

			type();

			assert.strictEqual(isHidden(), false);
		});

		test('ordinary keyboard text input hides the mouse pointer', () => {
			const { isHidden, type } = createEditor();

			assert.strictEqual(isHidden(), false);
			type();

			assert.strictEqual(isHidden(), true);
		});

		test('keyboard events alone do not hide the mouse pointer', () => {
			const { container, isHidden } = createEditor();
			const input = container.querySelector<HTMLElement>('.native-edit-context, textarea.inputarea');
			assert.ok(input, 'the editor should render a keyboard input element');

			for (const init of [
				{ key: 'Escape', code: 'Escape' },
				{ key: 'ArrowLeft', code: 'ArrowLeft' },
				{ key: 'F5', code: 'F5' },
				{ key: 'Shift', code: 'ShiftLeft', shiftKey: true },
				{ key: 'Control', code: 'ControlLeft', ctrlKey: true },
				{ key: 'Alt', code: 'AltLeft', altKey: true },
				{ key: 'Meta', code: 'MetaLeft', metaKey: true },
				{ key: 's', code: 'KeyS', ctrlKey: true },
				{ key: 's', code: 'KeyS', metaKey: true },
				{ key: 'a', code: 'KeyA' }
			]) {
				input.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }));
				input.dispatchEvent(new KeyboardEvent('keyup', { ...init, bubbles: true }));
			}

			assert.strictEqual(isHidden(), false);
		});

		test('paste and programmatic edits do not hide the mouse pointer', () => {
			const { editor, isHidden, type } = createEditor();

			editor.trigger('keyboard', Handler.Paste, { text: 'pasted' });
			assert.strictEqual(isHidden(), false, 'paste should not hide the mouse pointer');

			type('typed', 'someExtension');
			assert.strictEqual(isHidden(), false, 'a non keyboard source should not hide the mouse pointer');

			editor.getModel()!.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'edited' }]);
			assert.strictEqual(isHidden(), false, 'a model edit should not hide the mouse pointer');

			editor.executeEdits('test', [{ range: new Range(1, 1, 1, 1), text: 'edited' }]);
			assert.strictEqual(isHidden(), false, 'an editor edit should not hide the mouse pointer');
		});

		test('empty keyboard input does not hide the mouse pointer', () => {
			const { isHidden, type } = createEditor();

			type('');

			assert.strictEqual(isHidden(), false);
		});

		for (const [name, event] of [
			['pointer move', () => new MouseEvent('pointermove', { bubbles: true, movementX: 4 })],
			['pointer leave', () => new MouseEvent('pointerleave')],
			['pointer down', () => new MouseEvent('pointerdown', { bubbles: true })],
			['wheel', () => new WheelEvent('wheel', { bubbles: true })],
			['context menu', () => new MouseEvent('contextmenu', { bubbles: true })]
		] as const) {
			test(`${name} reveals the mouse pointer`, () => {
				const { container, isHidden, typeAndAssertHidden } = createEditor();
				typeAndAssertHidden();

				container.dispatchEvent(event());

				assert.strictEqual(isHidden(), false);
			});
		}

		test('a pointer move without movement does not reveal the mouse pointer', () => {
			const { container, isHidden, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			// The browser re-dispatches a pointer move at the same position whenever the element
			// below a resting pointer changes, which typing does on almost every keystroke.
			container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, screenX: 10, screenY: 20 }));
			assert.strictEqual(isHidden(), true);

			container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, screenX: 10, screenY: 20 }));
			assert.strictEqual(isHidden(), true);

			// A different position is a real movement, even without `movementX`/`movementY`.
			container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, screenX: 11, screenY: 20 }));
			assert.strictEqual(isHidden(), false);
		});

		test('pointer events on a descendant reveal the mouse pointer', () => {
			const { container, isHidden, typeAndAssertHidden } = createEditor();
			const descendant = container.querySelector('.monaco-editor');
			assert.ok(descendant, 'the editor should render its root node');
			typeAndAssertHidden();

			descendant.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, movementX: 4 }));

			assert.strictEqual(isHidden(), false);
		});

		test('owner window blur reveals the mouse pointer', () => {
			const { isHidden, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			mainWindow.dispatchEvent(new FocusEvent('blur'));

			assert.strictEqual(isHidden(), false);
		});

		test('editor blur reveals the mouse pointer', () => {
			const { userInteractionService, container, editor, isHidden, typeAndAssertHidden } = createEditor();

			userInteractionService.focusTracker.fireFocus();
			assert.strictEqual(editor.hasWidgetFocus(), true, 'the editor should be focused');
			typeAndAssertHidden();

			userInteractionService.focusTracker.fireBlur();

			assert.strictEqual(editor.hasWidgetFocus(), false);
			assert.strictEqual(isHidden(), false);
			assert.strictEqual(container.classList.contains(HIDDEN_CLASS_NAME), false);
		});

		test('disabling the option reveals the mouse pointer', () => {
			const { editor, isHidden, type, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			editor.updateOptions({ hideMouseCursorOnTyping: false });
			assert.strictEqual(isHidden(), false);

			type();
			assert.strictEqual(isHidden(), false, 'typing should not hide once the option is off');
		});

		test('replacing the model reveals the mouse pointer', () => {
			const { instantiationService, editor, isHidden, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			editor.setModel(disposables.add(instantiateTextModel(instantiationService, 'other')));
			assert.strictEqual(isHidden(), false);

			typeAndAssertHidden();
			editor.setModel(null);
			assert.strictEqual(isHidden(), false, 'detaching the model should reveal the mouse pointer');
		});

		test('disposing the editor reveals the mouse pointer', () => {
			const { container, editor, isHidden, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			editor.dispose();

			assert.strictEqual(isHidden(), false);
			assert.strictEqual(container.classList.contains(HIDDEN_CLASS_NAME), false);
		});

		test('IME composition keeps the mouse pointer visible', () => {
			const { editor, isHidden, type, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			editor.trigger('keyboard', Handler.CompositionStart, {});
			assert.strictEqual(isHidden(), false, 'composition start should reveal the mouse pointer');

			editor.trigger('keyboard', Handler.CompositionType, { text: 'ｎ', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
			assert.strictEqual(isHidden(), false, 'a composition update should keep the mouse pointer visible');

			editor.trigger('keyboard', Handler.ReplacePreviousChar, { text: 'に', replaceCharCnt: 1 });
			assert.strictEqual(isHidden(), false, 'a legacy composition update should keep the mouse pointer visible');

			type('日');
			assert.strictEqual(isHidden(), false, 'text committed while composing should keep the mouse pointer visible');

			editor.trigger('keyboard', Handler.CompositionEnd, {});
			assert.strictEqual(isHidden(), false, 'composition end should keep the mouse pointer visible');

			typeAndAssertHidden();
		});

		test('a cancelled IME composition keeps the mouse pointer visible', () => {
			const { editor, isHidden, typeAndAssertHidden } = createEditor();
			typeAndAssertHidden();

			editor.trigger('keyboard', Handler.CompositionStart, {});
			editor.trigger('keyboard', Handler.CompositionEnd, {});

			assert.strictEqual(isHidden(), false);
			typeAndAssertHidden();
		});

		test('a composition interrupted by a model change does not block hiding', () => {
			const { instantiationService, editor, typeAndAssertHidden } = createEditor();

			// The view and its IME input element are destroyed without a matching composition end.
			editor.trigger('keyboard', Handler.CompositionStart, {});
			editor.setModel(disposables.add(instantiateTextModel(instantiationService, 'other')));

			typeAndAssertHidden();
		});

		test('the editor and its descendants compute to `cursor: none` while hidden', () => {
			const { container, editor, isHidden, typeAndAssertHidden } = createEditor();
			const editorNode = container.querySelector<HTMLElement>('.monaco-editor');
			assert.ok(editorNode, 'the editor should render its root node');

			// A descendant which explicitly asks for a different pointer.
			const descendant = document.createElement('div');
			descendant.style.cursor = 'pointer';
			editorNode.appendChild(descendant);

			// A diff editor unchanged region control, which declares its cursor with `!important`.
			const hiddenLines = document.createElement('div');
			hiddenLines.className = 'diff-hidden-lines';
			const unchangedRegionControl = document.createElement('div');
			unchangedRegionControl.className = 'top canMoveTop';
			hiddenLines.appendChild(unchangedRegionControl);
			editorNode.appendChild(hiddenLines);

			const cursorOf = (element: HTMLElement) => mainWindow.getComputedStyle(element).cursor;
			assert.deepStrictEqual({
				root: cursorOf(container),
				descendant: cursorOf(descendant),
				unchangedRegionControl: cursorOf(unchangedRegionControl)
			}, {
				root: 'auto',
				descendant: 'pointer',
				unchangedRegionControl: 'n-resize'
			}, 'the mouse pointer should be untouched before typing');

			typeAndAssertHidden();
			assert.deepStrictEqual({
				root: cursorOf(container),
				editorNode: cursorOf(editorNode),
				descendant: cursorOf(descendant),
				unchangedRegionControl: cursorOf(unchangedRegionControl)
			}, {
				root: 'none',
				editorNode: 'none',
				descendant: 'none',
				unchangedRegionControl: 'none'
			}, 'the mouse pointer should be hidden over the whole editor');

			container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, movementX: 4 }));
			assert.strictEqual(isHidden(), false);
			assert.deepStrictEqual({
				root: cursorOf(container),
				descendant: cursorOf(descendant),
				unchangedRegionControl: cursorOf(unchangedRegionControl)
			}, {
				root: 'auto',
				descendant: 'pointer',
				unchangedRegionControl: 'n-resize'
			}, 'the mouse pointer should be restored');

			editor.dispose();
		});
	});

	test('onDidChangeModelDecorations', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelDecorations((e) => {
				invoked = true;
			}));

			viewModel.model.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: 'test' } }]);

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelLanguage', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageService);
			const disposables = new DisposableStore();
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguage((e) => {
				invoked = true;
			}));

			viewModel.model.setLanguage('testMode');

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelLanguageConfiguration', () => {
		withTestCodeEditor('', {}, (editor, viewModel, instantiationService) => {
			const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
			const languageService = instantiationService.get(ILanguageService);
			const disposables = new DisposableStore();
			disposables.add(languageService.registerLanguage({ id: 'testMode' }));
			viewModel.model.setLanguage('testMode');

			let invoked = false;
			disposables.add(editor.onDidChangeModelLanguageConfiguration((e) => {
				invoked = true;
			}));

			disposables.add(languageConfigurationService.register('testMode', {
				brackets: [['(', ')']]
			}));

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelContent', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelContent((e) => {
				invoked = true;
			}));

			viewModel.type('hello', 'test');

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('onDidChangeModelOptions', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let invoked = false;
			disposables.add(editor.onDidChangeModelOptions((e) => {
				invoked = true;
			}));

			viewModel.model.updateOptions({
				tabSize: 3
			});

			assert.deepStrictEqual(invoked, true);

			disposables.dispose();
		});
	});

	test('issue #145872 - Model change events are emitted before the selection updates', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			let observedSelection: Selection | null = null;
			disposables.add(editor.onDidChangeModelContent((e) => {
				observedSelection = editor.getSelection();
			}));

			viewModel.type('hello', 'test');

			assert.deepStrictEqual(observedSelection, new Selection(1, 6, 1, 6));

			disposables.dispose();
		});
	});

	test('monaco-editor issue #2774 - Wrong order of events onDidChangeModelContent and onDidChangeCursorSelection on redo', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');
			viewModel.model.undo();
			viewModel.model.redo();

			assert.deepStrictEqual(calls, [
				'contentchange(a, 0, 0)',
				'cursorchange(1, 2)',
				'contentchange(, 0, 1)',
				'cursorchange(1, 1)',
				'contentchange(a, 0, 0)',
				'cursorchange(1, 2)'
			]);

			disposables.dispose();
		});
	});

	test('issue #146174: Events delivered out of order when adding decorations in content change listener (1 of 2)', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener1 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener2 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');

			assert.deepStrictEqual(calls, ([
				'listener1 - contentchange(a, 0, 0)',
				'listener2 - contentchange(a, 0, 0)',
				'listener1 - cursorchange(1, 2)',
				'listener2 - cursorchange(1, 2)',
			]));

			disposables.dispose();
		});
	});

	test('issue #146174: Events delivered out of order when adding decorations in content change listener (2 of 2)', () => {
		withTestCodeEditor('', {}, (editor, viewModel) => {
			const disposables = new DisposableStore();

			const calls: string[] = [];
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener1 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
				editor.changeDecorations((changeAccessor) => {
					changeAccessor.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: 'test' } }]);
				});
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));
			disposables.add(editor.onDidChangeModelContent((e) => {
				calls.push(`listener2 - contentchange(${e.changes.reduce<any[]>((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(', ')})`);
			}));
			disposables.add(editor.onDidChangeCursorSelection((e) => {
				calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
			}));

			viewModel.type('a', 'test');

			assert.deepStrictEqual(calls, ([
				'listener1 - contentchange(a, 0, 0)',
				'listener2 - contentchange(a, 0, 0)',
				'listener1 - cursorchange(1, 2)',
				'listener2 - cursorchange(1, 2)',
			]));

			disposables.dispose();
		});
	});

	test('getBottomForLineNumber should handle invalid line numbers gracefully', () => {
		withTestCodeEditor('line1\nline2\nline3', {}, (editor, viewModel) => {
			// Test with lineNumber greater than line count
			const result1 = editor.getBottomForLineNumber(100);
			assert.ok(result1 >= 0, 'Should return a valid position for out-of-bounds line number');

			// Test with lineNumber less than 1
			const result2 = editor.getBottomForLineNumber(0);
			assert.ok(result2 >= 0, 'Should return a valid position for line number 0');

			// Test with negative lineNumber
			const result3 = editor.getBottomForLineNumber(-5);
			assert.ok(result3 >= 0, 'Should return a valid position for negative line number');

			// Test with valid lineNumber should still work
			const result4 = editor.getBottomForLineNumber(2);
			assert.ok(result4 > 0, 'Should return a valid position for valid line number');
		});
	});

});
