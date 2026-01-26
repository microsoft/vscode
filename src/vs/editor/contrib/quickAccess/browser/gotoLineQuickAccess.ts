/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IQuickInputButton, IQuickPick, IQuickPickItem, QuickInputButtonLocation } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getCodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption, RenderLineNumbersType } from '../../../common/config/editorOptions.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { IPosition } from '../../../common/core/position.js';
import { IRange } from '../../../common/core/range.js';
import { IEditor, ScrollType } from '../../../common/editorCommon.js';
import { AbstractEditorNavigationQuickAccessProvider, IQuickAccessTextEditorContext } from './editorNavigationQuickAccess.js';

interface IGotoLineQuickPickItem extends IQuickPickItem, Partial<IPosition> { }

export abstract class AbstractGotoLineQuickAccessProvider extends AbstractEditorNavigationQuickAccessProvider {

	static readonly GO_TO_LINE_PREFIX = ':';
	static readonly GO_TO_OFFSET_PREFIX = '::';
	private static readonly ZERO_BASED_OFFSET_STORAGE_KEY = 'gotoLine.useZeroBasedOffset';

	constructor() {
		super({ canAcceptInBackground: true });
	}

	protected abstract readonly storageService: IStorageService;

	private get useZeroBasedOffset() {
		return this.storageService.getBoolean(
			AbstractGotoLineQuickAccessProvider.ZERO_BASED_OFFSET_STORAGE_KEY,
			StorageScope.APPLICATION,
			false);
	}

	private set useZeroBasedOffset(value: boolean) {
		this.storageService.store(
			AbstractGotoLineQuickAccessProvider.ZERO_BASED_OFFSET_STORAGE_KEY,
			value,
			StorageScope.APPLICATION,
			StorageTarget.USER);
	}

	protected provideWithoutTextEditor(picker: IQuickPick<IGotoLineQuickPickItem, { useSeparators: true }>): IDisposable {
		const label = localize('gotoLine.noEditor', "Open a text editor first to go to a line or an offset.");

		picker.items = [{ label }];
		picker.ariaLabel = label;

		return Disposable.None;
	}

	protected provideWithTextEditor(context: IQuickAccessTextEditorContext, picker: IQuickPick<IGotoLineQuickPickItem, { useSeparators: true }>, token: CancellationToken): IDisposable {
		const editor = context.editor;
		const disposables = new DisposableStore();

		// Goto line once picked
		disposables.add(picker.onDidAccept(event => {
			const [item] = picker.selectedItems;
			if (item) {
				if (!item.lineNumber) {
					return;
				}

				this.gotoLocation(context, { range: this.toRange(item.lineNumber, item.column), keyMods: picker.keyMods, preserveFocus: event.inBackground });

				if (!event.inBackground) {
					picker.hide();
				}
			}
		}));

		// Add a toggle to switch between 1- and 0-based offsets.
		const offsetButton: IQuickInputButton = {
			iconClass: ThemeIcon.asClassName(Codicon.indexZero),
			tooltip: localize('gotoLineToggleButton', "Toggle Zero-Based Offset"),
			location: QuickInputButtonLocation.Input,
			toggle: { checked: this.useZeroBasedOffset }
		};

		// React to picker changes
		const updatePickerAndEditor = () => {
			const inputText = picker.value.trim().substring(AbstractGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX.length);
			const { inOffsetMode, lineNumber, column, label } = this.parsePosition(editor, inputText);

			// Show toggle only when input text starts with '::'.
			picker.buttons = inOffsetMode ? [offsetButton] : [];

			// Picker
			picker.items = [{
				lineNumber,
				column,
				label,
			}];

			// Clear decorations for invalid range
			if (!lineNumber) {
				this.clearDecorations(editor);
				return;
			}

			// Reveal
			const range = this.toRange(lineNumber, column);
			editor.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate
			this.addDecorations(editor, range);
		};

		disposables.add(picker.onDidTriggerButton(button => {
			if (button === offsetButton) {
				this.useZeroBasedOffset = button.toggle?.checked ?? !this.useZeroBasedOffset;
				updatePickerAndEditor();
			}
		}));

		updatePickerAndEditor();
		disposables.add(picker.onDidChangeValue(() => updatePickerAndEditor()));

		// Adjust line number visibility as needed
		const codeEditor = getCodeEditor(editor);
		if (codeEditor) {
			const options = codeEditor.getOptions();
			const lineNumbers = options.get(EditorOption.lineNumbers);
			if (lineNumbers.renderType === RenderLineNumbersType.Relative) {
				codeEditor.updateOptions({ lineNumbers: 'on' });

				disposables.add(toDisposable(() => codeEditor.updateOptions({ lineNumbers: 'relative' })));
			}
		}

		return disposables;
	}

	private toRange(lineNumber = 1, column = 1): IRange {
		return {
			startLineNumber: lineNumber,
			startColumn: column,
			endLineNumber: lineNumber,
			endColumn: column
		};
	}

	protected parsePosition(editor: IEditor, value: string): Partial<IPosition> & { inOffsetMode?: boolean; label: string } {
		const model = this.getModel(editor);
		if (!model) {
			return {
				label: localize('gotoLine.noEditor', "Open a text editor first to go to a line or an offset.")
			};
		}

		// Support ::<offset> notation to navigate to a specific offset in the model.
		if (value.startsWith(':')) {
			let offset = parseInt(value.substring(1), 10);
			const maxOffset = model.getValueLength();
			if (isNaN(offset)) {
				// No valid offset specified.
				return {
					inOffsetMode: true,
					label: this.useZeroBasedOffset ?
						localize('gotoLine.offsetPromptZero', "Type a character position to go to (from 0 to {0}).", maxOffset - 1) :
						localize('gotoLine.offsetPrompt', "Type a character position to go to (from 1 to {0}).", maxOffset)
				};
			} else {
				const reverse = offset < 0;
				if (!this.useZeroBasedOffset) {
					// Convert 1-based offset to model's 0-based.
					offset -= Math.sign(offset);
				}

				if (reverse) {
					// Offset from the end of the buffer
					offset += maxOffset;
				}

				const pos = model.getPositionAt(offset);
				const visibleColumn = CursorColumns.visibleColumnFromColumn(
					model.getLineContent(pos.lineNumber),
					pos.column,
					model.getOptions().tabSize) + 1;

				return {
					...pos,
					inOffsetMode: true,
					label: localize('gotoLine.goToPosition', "Press 'Enter' to go to line {0} at column {1}.", pos.lineNumber, visibleColumn)
				};
			}
		} else {
			// Support line-col formats of `line,col`, `line:col`, `line#col`
			const parts = value.split(/,|:|#/);

			const maxLine = model.getLineCount();
			let lineNumber = parseInt(parts[0]?.trim(), 10);
			if (parts.length < 1 || isNaN(lineNumber)) {
				return {
					label: localize('gotoLine.linePrompt', "Type a line number to go to (from 1 to {0}).", maxLine)
				};
			}

			// Handle negative line numbers and clip to valid range.
			lineNumber = lineNumber >= 0 ? lineNumber : (maxLine + 1) + lineNumber;
			lineNumber = Math.min(Math.max(1, lineNumber), maxLine);

			// Treat column number as visible column
			const tabSize = model.getOptions().tabSize;
			const lineContent = model.getLineContent(lineNumber);
			const maxColumn = CursorColumns.visibleColumnFromColumn(lineContent, model.getLineMaxColumn(lineNumber), tabSize) + 1;

			let column = parseInt(parts[1]?.trim(), 10);
			if (parts.length < 2 || isNaN(column)) {
				return {
					lineNumber,
					column: 1,
					label: parts.length < 2 ?
						localize('gotoLine.lineColumnPrompt', "Press 'Enter' to go to line {0} or enter colon : to add a column number.", lineNumber) :
						localize('gotoLine.columnPrompt', "Press 'Enter' to go to line {0} or enter a column number (from 1 to {1}).", lineNumber, maxColumn)
				};
			}

			// Handle negative column numbers and clip to valid range.
			column = column >= 0 ? column : maxColumn + column;
			column = Math.min(Math.max(1, column), maxColumn);

			const realColumn = CursorColumns.columnFromVisibleColumn(lineContent, column - 1, tabSize);
			return {
				lineNumber,
				column: realColumn,
				label: localize('gotoLine.goToPosition', "Press 'Enter' to go to line {0} at column {1}.", lineNumber, column)
			};
		}
	}
}
