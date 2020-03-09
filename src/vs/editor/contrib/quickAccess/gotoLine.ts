/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPick, IQuickPickItem, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, toDisposable, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/functional';
import { IEditor, ScrollType, IDiffEditor } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IRange } from 'vs/editor/common/core/range';
import { withNullAsUndefined } from 'vs/base/common/types';
import { AbstractEditorQuickAccessProvider } from 'vs/editor/contrib/quickAccess/quickAccess';
import { IPosition } from 'vs/editor/common/core/position';

export const GOTO_LINE_PREFIX = ':';

interface IGotoLineQuickPickItem extends IQuickPickItem, Partial<IPosition> { }

export abstract class AbstractGotoLineQuickAccessProvider extends AbstractEditorQuickAccessProvider {

	provide(picker: IQuickPick<IGotoLineQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Provide based on current active editor
		let pickerDisposable = this.doProvide(picker, token);
		disposables.add(toDisposable(() => pickerDisposable.dispose()));

		// Re-create whenever the active editor changes
		disposables.add(this.onDidActiveTextEditorControlChange(() => {
			pickerDisposable.dispose();
			pickerDisposable = this.doProvide(picker, token);
		}));

		return disposables;
	}

	private doProvide(picker: IQuickPick<IGotoLineQuickPickItem>, token: CancellationToken): IDisposable {

		// With text control
		if (this.activeTextEditorControl) {
			return this.doProvideWithTextEditor(this.activeTextEditorControl, picker, token);
		}

		// Without text control
		return this.doProvideWithoutTextEditor(picker);
	}

	private doProvideWithoutTextEditor(picker: IQuickPick<IGotoLineQuickPickItem>): IDisposable {
		const label = localize('cannotRunGotoLine', "Open a text file first to go to a line.");
		picker.items = [{ label }];
		picker.ariaLabel = label;

		return Disposable.None;
	}

	private doProvideWithTextEditor(editor: IEditor, picker: IQuickPick<IGotoLineQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Restore any view state if this picker was closed
		// without actually going to a line
		const lastKnownEditorViewState = withNullAsUndefined(editor.saveViewState());
		once(token.onCancellationRequested)(() => {
			if (lastKnownEditorViewState) {
				editor.restoreViewState(lastKnownEditorViewState);
			}
		});

		// Goto line once picked
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item) {
				if (!this.isValidLineNumber(editor, item.lineNumber)) {
					return;
				}

				this.gotoLine(editor, this.toRange(item.lineNumber, item.column), picker.keyMods);

				picker.hide();
			}
		}));

		// React to picker changes
		const updatePickerAndEditor = () => {
			const position = this.parsePosition(editor, picker.value.trim().substr(GOTO_LINE_PREFIX.length));
			const label = this.getPickLabel(editor, position.lineNumber, position.column);

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
		updatePickerAndEditor();
		disposables.add(picker.onDidChangeValue(() => updatePickerAndEditor()));

		// Clean up decorations on dispose
		disposables.add(toDisposable(() => this.clearDecorations(editor)));

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

		// Support line-col formats of `line,col`, `line:col`, `line#col`
		const numbers = value.split(/,|:|#/).map(part => parseInt(part, 10)).filter(part => !isNaN(part));
		const endLine = this.lineCount(editor) + 1;

		return {
			lineNumber: numbers[0] > 0 ? numbers[0] : endLine + numbers[0],
			column: numbers[1]
		};
	}

	private getPickLabel(editor: IEditor, lineNumber: number, column: number | undefined): string {

		// Location valid: indicate this as picker label
		if (this.isValidLineNumber(editor, lineNumber)) {
			if (this.isValidColumn(editor, lineNumber, column)) {
				return localize('gotoLineColumnLabel', "Go to line {0} and column {1}.", lineNumber, column);
			}

			return localize('gotoLineLabel', "Go to line {0}.", lineNumber);
		}

		// Location invalid: show generic label
		const position = editor.getPosition() || { lineNumber: 1, column: 1 };
		const lineCount = this.lineCount(editor);
		if (lineCount > 1) {
			return localize('gotoLineLabelEmptyWithLimit', "Current Line: {0}, Column: {1}. Type a line number between 1 and {2} to navigate to.", position.lineNumber, position.column, lineCount);
		}

		return localize('gotoLineLabelEmpty', "Current Line: {0}, Column: {1}. Type a line number to navigate to.", position.lineNumber, position.column);
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

	private getModel(editor: IEditor | IDiffEditor): ITextModel | undefined {
		return isDiffEditor(editor) ?
			editor.getModel()?.modified :
			editor.getModel() as ITextModel;
	}

	protected gotoLine(editor: IEditor, range: IRange, keyMods: IKeyMods): void {
		editor.setSelection(range);
		editor.revealRangeInCenter(range, ScrollType.Smooth);
		editor.focus();
	}
}
