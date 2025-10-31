/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IQuickPick, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../../platform/theme/common/colors/inputColors.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { getCodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption, RenderLineNumbersType } from '../../../common/config/editorOptions.js';
import { IPosition } from '../../../common/core/position.js';
import { IRange } from '../../../common/core/range.js';
import { IEditor, ScrollType } from '../../../common/editorCommon.js';
import { AbstractEditorNavigationQuickAccessProvider, IQuickAccessTextEditorContext } from './editorNavigationQuickAccess.js';

interface IGotoLineQuickPickItem extends IQuickPickItem, Partial<IPosition> { }

export abstract class AbstractGotoLineQuickAccessProvider extends AbstractEditorNavigationQuickAccessProvider {

	static PREFIX = ':';

	private _useZeroBasedOffset: boolean;

	constructor(private useZeroBasedOffsetSetting?: { value: boolean }) {
		super({ canAcceptInBackground: true });
		this._useZeroBasedOffset = useZeroBasedOffsetSetting?.value === true;
	}

	private get useZeroBasedOffset() {
		return this._useZeroBasedOffset;
	}

	private set useZeroBasedOffset(value: boolean) {
		this._useZeroBasedOffset = value;
		if (this.useZeroBasedOffsetSetting) {
			// Asynchronously persist the setting change
			this.useZeroBasedOffsetSetting.value = value;
		}
	}

	protected provideWithoutTextEditor(picker: IQuickPick<IGotoLineQuickPickItem, { useSeparators: true }>): IDisposable {
		const label = localize('cannotRunGotoLine', "Open a text editor first to go to a line.");

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

		// React to picker changes
		const updatePickerAndEditor = () => {
			const inputText = picker.value.trim().substring(AbstractGotoLineQuickAccessProvider.PREFIX.length);
			const { inOffsetMode, lineNumber, column, label } = this.parsePosition(editor, inputText);

			// Show toggle only when input text starts with '::'.
			toggle.visible = !!inOffsetMode;

			// Picker
			picker.items = [{
				lineNumber,
				column,
				label,
			}];

			// ARIA Label
			picker.ariaLabel = label;

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

		// Add a toggle to switch between 1- and 0-based offsets.
		const toggle = new Toggle({
			title: localize('gotoLineToggle', "Use Zero-Based Offset"),
			icon: Codicon.indexZero,
			isChecked: this.useZeroBasedOffset,
			inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
			inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
			inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
		});

		disposables.add(
			toggle.onChange(() => {
				this.useZeroBasedOffset = !this.useZeroBasedOffset;
				updatePickerAndEditor();
			}));

		picker.toggles = [toggle];

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
				label: localize('gotoLine.noEditor', "Open a text editor first to go to a line.")
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
					label: localize('gotoLine.offsetPrompt', "Type a character number in the file from 1 to {0} to go to.", maxOffset)
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
				return {
					...pos,
					inOffsetMode: true,
					label: localize('gotoLine.goToPosition', "Press Enter to go to line {0} and column {1}.", pos.lineNumber, pos.column)
				};
			}
		} else {
			// Support line-col formats of `line,col`, `line:col`, `line#col`
			const parts = value.split(/,|:|#/);

			const maxLine = model.getLineCount();
			let lineNumber = parseInt(parts[0]?.trim(), 10);
			if (parts.length < 1 || isNaN(lineNumber)) {
				return {
					label: localize('gotoLine.linePrompt', "Type a line number from 1 to {0} to go to.", maxLine)
				};
			}

			// Handle negative line numbers and clip to valid range.
			lineNumber = lineNumber >= 0 ? lineNumber : (maxLine + 1) + lineNumber;
			lineNumber = Math.min(Math.max(1, lineNumber), maxLine);

			const maxColumn = model.getLineMaxColumn(lineNumber);
			let column = parseInt(parts[1]?.trim(), 10);
			if (parts.length < 2 || isNaN(column)) {
				return {
					lineNumber,
					column: 1,
					label: parts.length < 2 ?
						localize('gotoLine.lineColumnPrompt', "Press Enter to go to line {0}. Type : to enter column number.", lineNumber) :
						localize('gotoLine.columnPrompt', "Press Enter to go to line {0} or enter column number from 1 to {1}.", lineNumber, maxColumn)
				};
			}

			// Handle negative column numbers and clip to valid range.
			column = column >= 0 ? column : maxColumn + column;
			column = Math.min(Math.max(1, column), maxColumn);

			return {
				lineNumber,
				column,
				label: localize('gotoLine.goToPosition', "Press Enter to go to line {0} and column {1}.", lineNumber, column)
			};
		}
	}
}
