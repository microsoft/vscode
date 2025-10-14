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

	constructor(private useZeroBasedOffset: { value: boolean } = { value: false }) {
		super({ canAcceptInBackground: true });
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
				if (!this.isValidLineNumber(editor, item.lineNumber)) {
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
			const inOffsetMode = inputText.startsWith(':');
			const position = this.parsePosition(editor, inputText);
			const label = this.getPickLabel(editor, position.lineNumber, position.column, inOffsetMode);

			// Show toggle only when input text starts with '::'.
			toggle.visible = inOffsetMode;

			// Picker
			picker.items = [{
				lineNumber: position.lineNumber,
				column: position.column,
				label
			}];

			// ARIA Label
			picker.ariaLabel = label;

			// Clear decorations for invalid range
			if (!this.isValidLineNumber(editor, position.lineNumber)) {
				this.clearDecorations(editor);
				return;
			}

			// Reveal
			const range = this.toRange(position.lineNumber, position.column);
			editor.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate
			this.addDecorations(editor, range);
		};

		// Add a toggle to switch between 1- and 0-based offsets.
		const toggle = new Toggle({
			title: localize('gotoLineToggle', "Use zero-based offset"),
			icon: Codicon.symbolArray,
			isChecked: this.useZeroBasedOffset.value,
			inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
			inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
			inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
		});

		disposables.add(
			toggle.onChange(() => {
				this.useZeroBasedOffset.value = !this.useZeroBasedOffset.value;
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

	private parsePosition(editor: IEditor, value: string): IPosition {

		// Support ::<offset> notation to navigate to a specific offset in the model.
		if (value.startsWith(':')) {
			let offset = parseInt(value.substring(1), 10);
			if (!isNaN(offset)) {
				const model = this.getModel(editor);
				if (model) {
					const reverse = offset < 0;
					if (!this.useZeroBasedOffset.value) {
						// Convert 1-based offset to model's 0-based.
						offset -= Math.sign(offset);
					}
					if (reverse) {
						// Offset from the end of the buffer
						offset += model.getValueLength();
					}
					return model.getPositionAt(offset);
				}
			}
		}

		// Support line-col formats of `line,col`, `line:col`, `line#col`
		const numbers = value.split(/,|:|#/).map(part => parseInt(part, 10)).filter(part => !isNaN(part));
		const endLine = this.lineCount(editor) + 1;

		return {
			lineNumber: numbers[0] > 0 ? numbers[0] : endLine + numbers[0],
			column: numbers[1]
		};
	}

	private getPickLabel(editor: IEditor, lineNumber: number, column: number | undefined, inOffsetMode: boolean): string {

		// Location valid: indicate this as picker label
		if (this.isValidLineNumber(editor, lineNumber)) {
			if (this.isValidColumn(editor, lineNumber, column)) {
				return localize('gotoLineColumnLabel', "Go to line {0} and character {1}.", lineNumber, column);
			}

			return localize('gotoLineLabel', "Go to line {0}.", lineNumber);
		}

		// Location invalid: show generic label
		const position = editor.getPosition() || { lineNumber: 1, column: 1 };

		// When in offset mode, prompt for an offset.
		if (inOffsetMode) {
			return localize('gotoLineOffsetLabel', "Current Line: {0}, Character: {1}. Type a character offset to navigate to.", position.lineNumber, position.column);
		}

		const lineCount = this.lineCount(editor);
		if (lineCount > 1) {
			return localize('gotoLineLabelEmptyWithLimit', "Current Line: {0}, Character: {1}. Type a line number between 1 and {2} to navigate to.", position.lineNumber, position.column, lineCount);
		}

		return localize('gotoLineLabelEmpty', "Current Line: {0}, Character: {1}. Type a line number to navigate to.", position.lineNumber, position.column);
	}

	private isValidLineNumber(editor: IEditor, lineNumber: number | undefined): boolean {
		if (!lineNumber || typeof lineNumber !== 'number') {
			return false;
		}

		return lineNumber > 0 && lineNumber <= this.lineCount(editor);
	}

	private isValidColumn(editor: IEditor, lineNumber: number, column: number | undefined): boolean {
		if (!column || typeof column !== 'number') {
			return false;
		}

		const model = this.getModel(editor);
		if (!model) {
			return false;
		}

		const positionCandidate = { lineNumber, column };

		return model.validatePosition(positionCandidate).equals(positionCandidate);
	}

	private lineCount(editor: IEditor): number {
		return this.getModel(editor)?.getLineCount() ?? 0;
	}
}
