/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContentWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { getContentScissorRect } from '../../../browser/gpu/gpuUtils.js';
import { CodeEditorWidget } from '../../../browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { StickyScrollWidget } from '../../../contrib/stickyScroll/browser/stickyScrollWidget.js';
import { createTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices, withTestCodeEditor } from '../testCodeEditor.js';

suite('CodeEditorWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('canvas padding rendering', () => {
		function createEditor(options: IEditorOptions = {}): CodeEditorWidget {
			const host = document.createElement('div');
			host.style.width = '1200px';
			host.style.height = '400px';
			document.body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			const services = createCodeEditorServices(store);
			const model = store.add(createTextModel('Readable text. '.repeat(100)));
			const editor = store.add(services.createInstance(CodeEditorWidget, host, {
				minimap: { enabled: false },
				padding: { maxEditorCanvasWidth: 600 },
				wordWrap: 'on',
				...options
			}, { contributions: [] }));
			editor.setModel(model);
			editor.render(true);
			return editor;
		}

		for (const side of ['left', 'right'] as const) {
			test(`keeps caret coordinates and the scrollbar aligned with a ${side} minimap`, () => {
				const editor = createEditor({ minimap: { enabled: true, side } });
				const layout = editor.getLayoutInfo();
				const root = editor.getDomNode();
				const scrollbar = root.querySelector<HTMLElement>('.scrollbar.vertical')!;
				const bounds = root.getBoundingClientRect();
				const position = editor.getScrolledVisiblePosition({ lineNumber: 1, column: 5 })!;
				const target = editor.getTargetAtClientPoint(bounds.left + position.left, bounds.top + position.top + position.height / 2);
				assert.deepStrictEqual({
					textWidth: layout.contentWidth - layout.verticalScrollbarWidth,
					caretLeft: position.left,
					column: target?.position?.column,
					scrollbarRight: Math.round(scrollbar.getBoundingClientRect().right - bounds.left)
				}, {
					textWidth: 600,
					caretLeft: layout.contentLeft + editor.getOffsetForColumn(1, 5),
					column: 5,
					scrollbarRight: 1200
				});
			});
		}

		test('updates clipping and layout when resized or disabled', () => {
			const editor = createEditor();
			editor.layout({ width: 400, height: 400 });
			editor.render(true);
			const narrow = editor.getLayoutInfo();
			editor.updateOptions({ padding: { maxEditorCanvasWidth: 0 } });
			editor.render(true);
			assert.deepStrictEqual(editor.getLayoutInfo(), narrow);
			assert.strictEqual(getComputedStyle(editor.getDomNode().querySelector('.view-lines')!).clipPath, 'none');
			editor.layout({ width: 1200, height: 400 });
			editor.updateOptions({ padding: { maxEditorCanvasWidth: 300 } });
			editor.render(true);
			const wide = editor.getLayoutInfo();
			assert.strictEqual(wide.contentWidth - wide.verticalScrollbarWidth, 300);
		});

		test('bounds GPU clipping for scaling, resize, and disabled padding', () => {
			const editor = createEditor();
			const layout = editor.getLayoutInfo();
			for (const ratio of [1, 1.25, 2]) {
				const left = Math.ceil(layout.contentLeft * ratio);
				const right = Math.floor((layout.contentLeft + 600) * ratio);
				assert.deepStrictEqual(getContentScissorRect(layout, ratio, 1200 * ratio, 400 * ratio, true), [left, 0, right - left, 400 * ratio]);
				assert.deepStrictEqual(getContentScissorRect(layout, ratio, 1200 * ratio, 400 * ratio, false), [left, 0, 1200 * ratio - left, 400 * ratio]);
			}
			assert.deepStrictEqual(getContentScissorRect(layout, 1, 10, 400, true), [10, 0, 0, 400]);
			editor.layout({ width: 0, height: 400 });
			assert.deepStrictEqual(getContentScissorRect(editor.getLayoutInfo(), 1, 0, 400, true), [0, 0, 0, 400]);
		});

		test('updates sticky-scroll width when resized or disabled', () => {
			const editor = createEditor();
			const widget = store.add(new StickyScrollWidget(editor));
			const text = widget.getDomNode().querySelector<HTMLElement>('.sticky-widget-lines-scrollable')!;
			assert.strictEqual(text.style.maxWidth, '600px');
			editor.layout({ width: 400, height: 400 });
			const layout = editor.getLayoutInfo();
			assert.strictEqual(text.style.maxWidth, `${layout.contentWidth - layout.verticalScrollbarWidth}px`);
			editor.updateOptions({ padding: { maxEditorCanvasWidth: 0 } });
			assert.strictEqual(text.style.maxWidth, '');
		});

		test('does not clip the caret in its zero-height layer', async () => {
			const editor = createEditor({ cursorBlinking: 'solid', cursorWidth: 6 });
			editor.focus();
			editor.setPosition({ lineNumber: 1, column: 4 });
			editor.render(true);
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			editor.render(true);
			const cursor = editor.getDomNode().querySelector<HTMLElement>('.cursor')!;
			cursor.style.pointerEvents = 'auto';
			const bounds = cursor.getBoundingClientRect();
			assert.ok(bounds.width > 0 && bounds.height > 0);
			assert.strictEqual(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2), cursor);
		});

		test('does not clip content widgets at the text boundary', async () => {
			const editor = createEditor({ padding: { maxEditorCanvasWidth: 300 } });
			const node = document.createElement('div');
			node.style.width = '500px';
			node.style.height = '30px';
			const widget = {
				getId: () => 'canvas-padding-test',
				getDomNode: () => node,
				getPosition: () => ({ position: { lineNumber: 1, column: 1 }, preference: [ContentWidgetPositionPreference.EXACT] })
			};
			editor.addContentWidget(widget);
			store.add(toDisposable(() => editor.removeContentWidget(widget)));
			editor.render(true);
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			editor.render(true);
			const bounds = node.getBoundingClientRect();
			assert.strictEqual(node.contains(document.elementFromPoint(bounds.left + 305, bounds.top + 10)), true);
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
