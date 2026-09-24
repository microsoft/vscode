/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../../base/common/platform.js';
import { splitLines } from '../../../../base/common/strings.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { createClipboardCopyEvent, createClipboardPasteEvent, InMemoryClipboardMetadataManager } from '../../../browser/controller/editContext/clipboardUtils.js';
import { CoreNavigationCommands } from '../../../browser/coreCommands.js';
import { ICodeEditor, IPasteEvent, PastePayload } from '../../../browser/editorBrowser.js';
import { EditorOption, EditorOptions, IEditorOptions } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { Handler } from '../../../common/editorCommon.js';
import { InputMode } from '../../../common/inputMode.js';
import { EndOfLineSequence } from '../../../common/model.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { withTestCodeEditor } from '../testCodeEditor.js';

suite('Column selection paste', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const block = 'A\nBC\nD';

	teardown(() => {
		InMemoryClipboardMetadataManager.INSTANCE.get('');
	});

	function paste(editor: ICodeEditor, text: string = block, overrides: Partial<PastePayload> = {}): void {
		editor.trigger('keyboard', Handler.Paste, {
			text,
			pasteOnNewLine: false,
			multicursorText: splitLines(text),
			mode: null,
			isBlock: true,
			...overrides
		} satisfies PastePayload);
	}

	const cases: {
		name: string;
		text: string[];
		selections: Selection[];
		expected: string[];
		pastedText?: string;
		tabSize?: number;
		options?: IEditorOptions;
		payload?: Partial<PastePayload>;
	}[] = [
			{
				name: 'inserts successive rows from a single cursor',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 1, 5)],
				expected: ['leftA--right', 'leftBC--right', 'leftD--right']
			},
			{
				name: 'replaces a single-line selection with the first row',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 1, 7)],
				expected: ['leftAright', 'leftBC--right', 'leftD--right']
			},
			{
				name: 'uses the start of a reversed selection',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 7, 1, 5)],
				expected: ['leftAright', 'leftBC--right', 'leftD--right']
			},
			{
				name: 'replaces the selected slices of an equal-height continuous selection',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 3, 7)],
				expected: ['leftA', 'BC', 'Dright']
			},
			{
				name: 'replaces a reversed equal-height continuous selection',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(3, 7, 1, 5)],
				expected: ['leftA', 'BC', 'Dright']
			},
			{
				name: 'preserves the newline after an equal-height full-line selection',
				text: ['first', 'second', 'third', 'unselected'],
				selections: [new Selection(1, 1, 4, 1)],
				expected: ['A', 'BC', 'D', 'unselected']
			},
			{
				name: 'excludes the empty end row of a reversed continuous selection',
				text: ['left--right', 'second', 'third', 'unselected'],
				selections: [new Selection(4, 1, 1, 5)],
				expected: ['leftA', 'BC', 'D', 'unselected']
			},
			{
				name: 'uses normal replacement for a shorter continuous selection',
				text: ['left--right', 'left--right', 'last'],
				selections: [new Selection(1, 5, 2, 7)],
				expected: ['leftA', 'BC', 'Dright', 'last']
			},
			{
				name: 'uses normal replacement for a taller continuous selection',
				text: ['left--right', 'middle', 'middle', 'left--right'],
				selections: [new Selection(1, 5, 4, 7)],
				expected: ['leftA', 'BC', 'Dright']
			},
			{
				name: 'pads short and empty lines to the block column',
				text: ['left--right', 'x', ''],
				selections: [new Selection(1, 5, 1, 5)],
				expected: ['leftA--right', 'x   BC', '    D']
			},
			{
				name: 'appends missing rows without moving the existing suffix',
				text: ['left--right'],
				selections: [new Selection(1, 5, 1, 5)],
				expected: ['leftA--right', '    BC', '    D']
			},
			{
				name: 'appends rows when the cursor is at the end of the file',
				text: ['left'],
				selections: [new Selection(1, 5, 1, 5)],
				expected: ['leftA', '    BC', '    D']
			},
			{
				name: 'pastes into an empty document',
				text: [''],
				selections: [new Selection(1, 1, 1, 1)],
				expected: ['A', 'BC', 'D']
			},
			{
				name: 'preserves empty and trailing copied rows',
				text: ['left--right', 'left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 1, 5)],
				pastedText: 'A\n\nD\n',
				expected: ['leftA--right', 'left--right', 'leftD--right', 'left--right']
			},
			{
				name: 'pads short lines for empty and trailing copied rows',
				text: ['left', 'x', '', 'y'],
				selections: [new Selection(1, 5, 1, 5)],
				pastedText: 'A\n\nD\n',
				expected: ['leftA', 'x   ', '    D', 'y   ']
			},
			{
				name: 'appends empty and trailing copied rows',
				text: ['left'],
				selections: [new Selection(1, 5, 1, 5)],
				pastedText: 'A\n\nD\n',
				expected: ['leftA', '    ', '    D', '    ']
			},
			{
				name: 'aligns using visible columns across tabs and spaces',
				text: ['\tleft', '    left', '  \tleft'],
				selections: [new Selection(1, 2, 1, 2)],
				expected: ['\tAleft', '    BCleft', '  \tDleft']
			},
			{
				name: 'pads short lines using the configured tab size',
				text: ['\t--left', '\t', ''],
				selections: [new Selection(1, 4, 1, 4)],
				tabSize: 8,
				expected: ['\t--Aleft', '\t  BC', '          D']
			},
			{
				name: 'pads using visible widths of graphemes and full-width characters',
				text: ['left--right', 'e\u0301', '\u4E2D', '\u{1F600}'],
				selections: [new Selection(1, 5, 1, 5)],
				pastedText: 'A\nB\nC\nD',
				expected: ['leftA--right', 'e\u0301   B', '\u4E2D  C', '\u{1F600}  D']
			},
			{
				name: 'uses grapheme boundaries and full-width character columns',
				text: ['\u{1F600}left', 'e\u0301xleft', '\u4E2Dleft'],
				selections: [new Selection(1, 3, 1, 3)],
				expected: ['\u{1F600}Aleft', 'e\u0301xBCleft', '\u4E2DDleft']
			},
			{
				name: 'uses successive model lines when word wrap is enabled',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 1, 5)],
				options: { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 },
				expected: ['leftA--right', 'leftBC--right', 'leftD--right']
			},
			{
				name: 'does not create cursors or truncate at the multi-cursor limit',
				text: ['left--right', 'left--right', 'left--right'],
				selections: [new Selection(1, 5, 1, 5)],
				options: { multiCursorLimit: 1 },
				expected: ['leftA--right', 'leftBC--right', 'leftD--right']
			},
			{
				name: 'distributes matching cursors in document order',
				text: ['xx', 'yy', 'zz'],
				selections: [new Selection(3, 2, 3, 2), new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2)],
				expected: ['xAx', 'yBCy', 'zDz']
			},
			{
				name: 'distributes matching non-empty selections',
				text: ['[one]', '[two]', '[three]'],
				selections: [new Selection(1, 2, 1, 5), new Selection(2, 2, 2, 5), new Selection(3, 2, 3, 7)],
				expected: ['[A]', '[BC]', '[D]']
			},
			{
				name: 'repeats the whole text when multiple cursor counts differ',
				text: ['xx', 'yy', 'zz'],
				selections: [new Selection(1, 2, 1, 2), new Selection(3, 2, 3, 2)],
				expected: ['xA', 'BC', 'Dx', 'yy', 'zA', 'BC', 'Dz']
			},
			{
				name: 'repeats the whole text when multiple non-empty selection counts differ',
				text: ['[one]', '[two]', '[three]'],
				selections: [new Selection(1, 2, 1, 5), new Selection(3, 2, 3, 7)],
				expected: ['[A', 'BC', 'D]', '[two]', '[A', 'BC', 'D]']
			},
			{
				name: 'does not discard an empty trailing row to match cursor counts',
				text: ['xx', 'yy'],
				selections: [new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2)],
				pastedText: 'A\nB\n',
				expected: ['xA', 'B', 'x', 'yA', 'B', 'y']
			},
			{
				name: 'block mode is independent of multiCursorPaste full',
				text: ['xx', 'yy', 'zz'],
				selections: [new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)],
				options: { multiCursorPaste: 'full' },
				payload: { multicursorText: null },
				expected: ['xAx', 'yBCy', 'zDz']
			},
			{
				name: 'text mode retains single-cursor multiline pasting',
				text: ['left--right', 'last'],
				selections: [new Selection(1, 5, 1, 5)],
				options: { columnSelectionPaste: 'text' },
				expected: ['leftA', 'BC', 'D--right', 'last']
			},
			{
				name: 'text mode retains existing multi-cursor metadata distribution',
				text: ['xx', 'yy', 'zz'],
				selections: [new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)],
				options: { columnSelectionPaste: 'text', multiCursorPaste: 'full' },
				expected: ['xAx', 'yBCy', 'zDz']
			},
			{
				name: 'ordinary multi-cursor copies are not treated as blocks',
				text: ['left--right', 'last'],
				selections: [new Selection(1, 5, 1, 5)],
				payload: { isBlock: false },
				expected: ['leftA', 'BC', 'D--right', 'last']
			},
			{
				name: 'missing block metadata retains normal paste',
				text: ['left--right', 'last'],
				selections: [new Selection(1, 5, 1, 5)],
				payload: { isBlock: undefined, multicursorText: null },
				expected: ['leftA', 'BC', 'D--right', 'last']
			},
			{
				name: 'preserves ordinary spread pasting without metadata',
				text: ['xx', 'yy', 'zz'],
				selections: [new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)],
				payload: { isBlock: undefined, multicursorText: null },
				expected: ['xAx', 'yBCy', 'zDz']
			},
			{
				name: 'preserves ordinary full pasting without metadata',
				text: ['xx', 'yy'],
				selections: [new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2)],
				pastedText: 'A\nB',
				options: { multiCursorPaste: 'full' },
				payload: { isBlock: undefined, multicursorText: null },
				expected: ['xA', 'Bx', 'yA', 'By']
			},
			{
				name: 'does not edit a read-only document',
				text: ['left--right', 'last'],
				selections: [new Selection(1, 5, 1, 5)],
				options: { readOnly: true },
				expected: ['left--right', 'last']
			}
		];

	for (const scenario of cases) {
		test(scenario.name, () => {
			withTestCodeEditor(scenario.text, { columnSelectionPaste: 'block', ...scenario.options }, editor => {
				editor.getModel().updateOptions({ tabSize: scenario.tabSize ?? 4 });
				editor.setSelections(scenario.selections);
				paste(editor, scenario.pastedText ?? block, scenario.payload);
				assert.deepStrictEqual(editor.getModel().getLinesContent(), scenario.expected);
			});
		});
	}

	test('preserves CRLF line endings', () => {
		withTestCodeEditor(['left', 'x'], { columnSelectionPaste: 'block' }, editor => {
			editor.getModel().setEOL(EndOfLineSequence.CRLF);
			editor.setPosition(new Position(1, 5));
			paste(editor, 'A\r\nBC\r\nD');
			assert.strictEqual(editor.getModel().getValue(), 'leftA\r\nx   BC\r\n    D');
		});
	});

	test('leaves the cursor on an empty trailing pasted row', () => {
		withTestCodeEditor(['left', 'left', 'left'], { columnSelectionPaste: 'block' }, editor => {
			editor.setPosition(new Position(1, 5));
			paste(editor, 'A\nBC\n');
			assert.deepStrictEqual({ text: editor.getModel().getLinesContent(), selections: editor.getSelections() }, {
				text: ['leftA', 'leftBC', 'left'],
				selections: [new Selection(3, 5, 3, 5)]
			});
		});
	});

	test('leaves the cursor after padding on an empty trailing pasted row', () => {
		withTestCodeEditor(['left', 'x', ''], { columnSelectionPaste: 'block' }, editor => {
			editor.setPosition(new Position(1, 5));
			paste(editor, 'A\nBC\n');
			assert.deepStrictEqual({ text: editor.getModel().getLinesContent(), selections: editor.getSelections() }, {
				text: ['leftA', 'x   BC', '    '],
				selections: [new Selection(3, 5, 3, 5)]
			});
		});
	});

	test('leaves the cursor after padding on an appended empty row', () => {
		withTestCodeEditor(['left'], { columnSelectionPaste: 'block' }, editor => {
			editor.setPosition(new Position(1, 5));
			paste(editor, 'A\nBC\n');
			assert.deepStrictEqual({ text: editor.getModel().getLinesContent(), selections: editor.getSelections() }, {
				text: ['leftA', '    BC', '    '],
				selections: [new Selection(3, 5, 3, 5)]
			});
		});
	});

	test('undo and redo preserve text and the original single selection', () => {
		withTestCodeEditor(['left--right', 'x'], { columnSelectionPaste: 'block' }, editor => {
			const model = editor.getModel();
			const selection = new Selection(1, 7, 1, 5);
			editor.setSelection(selection);
			paste(editor);
			const after = { text: model.getLinesContent(), selections: editor.getSelections() };
			model.undo();
			const undone = { text: model.getLinesContent(), selections: editor.getSelections() };
			model.redo();
			assert.deepStrictEqual({ after, undone, redone: { text: model.getLinesContent(), selections: editor.getSelections() } }, {
				after: { text: ['leftAright', 'x   BC', '    D'], selections: [new Selection(3, 6, 3, 6)] },
				undone: { text: ['left--right', 'x'], selections: [selection] },
				redone: { text: ['leftAright', 'x   BC', '    D'], selections: [new Selection(3, 6, 3, 6)] }
			});
		});
	});

	test('changes only the row ranges in one content change', () => {
		withTestCodeEditor(['left--right', 'x', ''], { columnSelectionPaste: 'block' }, editor => {
			const changes: { range: Range; text: string }[][] = [];
			editor.registerDisposable(editor.onDidChangeModelContent(e => changes.push(e.changes.map(change => ({ range: Range.lift(change.range), text: change.text })))));
			editor.setPosition(new Position(1, 5));
			paste(editor);
			assert.deepStrictEqual(changes, [[
				{ range: new Range(3, 1, 3, 1), text: '    D' },
				{ range: new Range(2, 2, 2, 2), text: '   BC' },
				{ range: new Range(1, 5, 1, 5), text: 'A' }
			]]);
		});
	});

	test('reports block pastes but not normal text fallbacks', () => {
		withTestCodeEditor(['left--right', 'left--right', 'left--right'], { columnSelectionPaste: 'block' }, editor => {
			const events: Pick<IPasteEvent, 'range'>[] = [];
			editor.registerDisposable(editor.onDidPaste(e => events.push({ range: e.range })));
			editor.setSelection(new Selection(1, 5, 1, 5));
			paste(editor);
			editor.getModel().undo();
			editor.setSelection(new Selection(1, 5, 2, 7));
			paste(editor);
			assert.deepStrictEqual(events, [
				{ range: new Range(1, 5, 3, 6) },
				{ range: new Range(1, 5, 3, 2) }
			]);
		});
	});

	test('responds to block, text, and block configuration transitions', () => {
		withTestCodeEditor(['left', 'x', ''], {}, editor => {
			const results: string[][] = [];
			const defaultValue = editor.getOption(EditorOption.columnSelectionPaste);
			for (const columnSelectionPaste of ['block', 'text', 'block'] as const) {
				editor.updateOptions({ columnSelectionPaste });
				editor.setPosition(new Position(1, 5));
				paste(editor);
				results.push(editor.getModel().getLinesContent());
				editor.getModel().undo();
			}
			assert.deepStrictEqual({ defaultValue, invalidValue: EditorOptions.columnSelectionPaste.validate('invalid'), results }, {
				defaultValue: 'text',
				invalidValue: 'text',
				results: [
					['leftA', 'x   BC', '    D'],
					['leftA', 'BC', 'D', 'x', ''],
					['leftA', 'x   BC', '    D']
				]
			});
		});
	});

	test('respects overtype and pads short rows', () => {
		const previousInputMode = InputMode.getInputMode();
		try {
			InputMode.setInputMode('overtype');
			withTestCodeEditor(['left--right', 'left--right', 'x', ''], { columnSelectionPaste: 'block', overtypeOnPaste: true }, editor => {
				editor.setPosition(new Position(1, 5));
				paste(editor, 'A\nBC\nD\nE');
				assert.deepStrictEqual(editor.getModel().getLinesContent(), ['leftA-right', 'leftBCright', 'x   D', '    E']);
			});
		} finally {
			InputMode.setInputMode(previousInputMode);
		}
	});

	suite('clipboard metadata', () => {
		function selectColumn(viewModel: ViewModel, from: Position, to: Position): void {
			viewModel.setSelections('test', [Selection.fromPositions(from)]);
			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: to,
				viewPosition: to,
				mouseColumn: to.column,
				doColumnSelect: true
			});
		}

		function copy(viewModel: ViewModel, isCut: boolean = false): DataTransfer {
			const clipboardData = new DataTransfer();
			const context = new class extends mock<ViewContext>() {
				override readonly viewModel = viewModel;
			};
			const event = createClipboardCopyEvent(new ClipboardEvent(isCut ? 'cut' : 'copy', { clipboardData }), isCut, context, store.add(new NullLogService()), false);
			event.ensureClipboardGetsEditorData();
			if (isCut) {
				viewModel.cut('keyboard');
			}
			return clipboardData;
		}

		for (const isCut of [false, true]) {
			test(`${isCut ? 'cut' : 'copy'} retains rectangular identity through clipboard serialization`, () => {
				withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (editor, viewModel) => {
					selectColumn(viewModel, new Position(1, 2), new Position(3, 4));
					const clipboardData = copy(viewModel, isCut);
					const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }));
					assert.deepStrictEqual({
						text: event.text,
						isBlock: event.metadata?.isBlock,
						multicursorText: event.metadata?.multicursorText,
						isFromEmptySelection: event.metadata?.isFromEmptySelection,
						document: editor.getModel().getLinesContent()
					}, {
						text: 'AA\nBB\nCC',
						isBlock: true,
						multicursorText: ['AA', 'BB', 'CC'],
						isFromEmptySelection: false,
						document: isCut ? ['<>', '<>', '<>'] : ['<AA>', '<BB>', '<CC>']
					});
				});
			});
		}

		test('copies reversed rectangles in document order', () => {
			withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (editor, viewModel) => {
				selectColumn(viewModel, new Position(3, 4), new Position(1, 2));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
				assert.deepStrictEqual({ text: event.text, isBlock: event.metadata?.isBlock }, { text: 'AA\nBB\nCC', isBlock: true });
			});
		});

		test('single-row column copies preserve the single-selection clipboard shape', () => {
			withTestCodeEditor(['<AA>'], {}, (editor, viewModel) => {
				selectColumn(viewModel, new Position(1, 2), new Position(1, 4));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
				assert.deepStrictEqual({ text: event.text, rows: event.metadata?.multicursorText, isBlock: event.metadata?.isBlock }, {
					text: 'AA', rows: null, isBlock: true
				});
			});
		});

		test('cut preserves empty rows and deletes only the copied text', () => {
			withTestCodeEditor(['AA', '', 'CC'], { emptySelectionClipboard: true }, (editor, viewModel) => {
				selectColumn(viewModel, new Position(1, 1), new Position(3, 3));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel, true) }));
				assert.deepStrictEqual({ text: event.text, document: editor.getModel().getLinesContent() }, {
					text: 'AA\n\nCC', document: ['', '', '']
				});
			});
		});

		for (const emptySelectionClipboard of [false, true]) {
			test(`preserves selected empty rows with emptySelectionClipboard ${emptySelectionClipboard}`, () => {
				withTestCodeEditor(['AA', '', 'CC'], { emptySelectionClipboard }, (editor, viewModel) => {
					selectColumn(viewModel, new Position(1, 1), new Position(3, 3));
					const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
					assert.deepStrictEqual({ text: event.text, rows: event.metadata?.multicursorText, isBlock: event.metadata?.isBlock }, {
						text: 'AA\n\nCC', rows: ['AA', '', 'CC'], isBlock: true
					});
				});
			});
		}

		test('aligned ordinary multi-selections are not rectangular copies', () => {
			withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (editor, viewModel) => {
				editor.setSelections([new Selection(1, 2, 1, 4), new Selection(2, 2, 2, 4), new Selection(3, 2, 3, 4)]);
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
				assert.deepStrictEqual({ text: event.text, isBlock: event.metadata?.isBlock }, { text: 'AA\nBB\nCC', isBlock: false });
			});
		});

		test('zero-width column selections retain ordinary whole-line copying', () => {
			withTestCodeEditor(['AA', 'BB', 'CC'], { emptySelectionClipboard: true }, (editor, viewModel) => {
				selectColumn(viewModel, new Position(1, 2), new Position(3, 2));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
				assert.deepStrictEqual({ rows: event.metadata?.multicursorText, isBlock: event.metadata?.isBlock }, {
					rows: ['AA', 'BB', 'CC'].map(line => line + (isWindows ? '\r\n' : '\n')), isBlock: false
				});
			});
		});

		test('changing the selection clears rectangular identity', () => {
			withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (editor, viewModel) => {
				selectColumn(viewModel, new Position(1, 2), new Position(3, 4));
				editor.setSelection(new Selection(1, 2, 3, 4));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData: copy(viewModel) }));
				assert.strictEqual(event.metadata?.isBlock, false);
			});
		});

		test('in-memory clipboard fallback retains rectangular identity only for matching text', () => {
			withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (editor, viewModel) => {
				selectColumn(viewModel, new Position(1, 2), new Position(3, 4));
				const clipboardData = copy(viewModel);
				clipboardData.clearData('vscode-editor-data');
				const matching = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }));
				clipboardData.setData('text/plain', 'external text');
				const changed = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }));
				assert.deepStrictEqual({ matching: matching.metadata?.isBlock, changed: changed.metadata }, { matching: true, changed: null });
			});
		});

		test('pastes a copied rectangle into another editor using serialized metadata', () => {
			withTestCodeEditor(['<AA>', '<BB>', '<CC>'], {}, (source, viewModel) => {
				selectColumn(viewModel, new Position(1, 2), new Position(3, 4));
				const clipboardData = copy(viewModel);
				InMemoryClipboardMetadataManager.INSTANCE.get('');
				withTestCodeEditor(['left--right', 'left--right', 'left--right'], { columnSelectionPaste: 'block' }, target => {
					target.setPosition(new Position(1, 5));
					const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }));
					paste(target, event.text, { isBlock: event.metadata?.isBlock === true, multicursorText: event.metadata?.multicursorText ?? null });
					assert.deepStrictEqual(target.getModel().getLinesContent(), ['leftAA--right', 'leftBB--right', 'leftCC--right']);
				});
			});
		});

		test('older clipboard metadata without a block flag uses normal paste', () => {
			const clipboardData = new DataTransfer();
			clipboardData.setData('text/plain', block);
			clipboardData.setData('vscode-editor-data', JSON.stringify({
				version: 1, isFromEmptySelection: false, multicursorText: ['A', 'BC', 'D'], mode: null
			}));
			withTestCodeEditor(['left--right'], {}, editor => {
				editor.setPosition(new Position(1, 5));
				const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }));
				paste(editor, event.text, { isBlock: event.metadata?.isBlock === true });
				assert.deepStrictEqual(editor.getModel().getLinesContent(), ['leftA', 'BC', 'D--right']);
			});
		});
	});
});
