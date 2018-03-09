/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as errors from 'vs/base/common/errors';
import { IEntryRunContext, Mode, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, EditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IEditor, IEditorViewState, IDiffEditorModel, ScrollType } from 'vs/editor/common/editorCommon';
import { IModelDecorationsChangeAccessor, OverviewRulerLane, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, IEditorInput, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { IRange } from 'vs/editor/common/core/range';
import { overviewRulerRangeHighlight } from 'vs/editor/common/view/editorColorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IEditorOptions, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';

export const GOTO_LINE_PREFIX = ':';

export class GotoLineAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.gotoLine';
	public static readonly LABEL = nls.localize('gotoLine', "Go to Line...");

	constructor(actionId: string, actionLabel: string,
		@IQuickOpenService private readonly _quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private readonly editorService: IWorkbenchEditorService
	) {
		super(actionId, actionLabel, GOTO_LINE_PREFIX, _quickOpenService);
	}

	public run(): TPromise<void> {

		const editor = getCodeEditor(this.editorService.getActiveEditor());
		let restoreOptions: IEditorOptions = null;

		if (editor) {
			const config = editor.getConfiguration();
			if (config.viewInfo.renderLineNumbers === RenderLineNumbersType.Relative) {
				editor.updateOptions({
					lineNumbers: 'on'
				});
				restoreOptions = {
					lineNumbers: 'relative'
				};
			}
		}

		const result = super.run();

		if (restoreOptions) {
			let toDispose = this._quickOpenService.onHide(() => {
				if (!toDispose) {
					return;
				}
				toDispose.dispose();
				toDispose = null;
				editor.updateOptions(restoreOptions);
			});
		}

		return result;
	}
}

class GotoLineEntry extends EditorQuickOpenEntry {
	private line: number;
	private column: number;
	private handler: GotoLineHandler;

	constructor(line: string, editorService: IWorkbenchEditorService, handler: GotoLineHandler) {
		super(editorService);

		this.parseInput(line);
		this.handler = handler;
	}

	private parseInput(line: string) {
		const numbers = line.split(/,|:|#/).map(part => parseInt(part, 10)).filter(part => !isNaN(part));
		this.line = numbers[0];
		this.column = numbers[1];
	}

	public getLabel(): string {

		// Inform user about valid range if input is invalid
		const maxLineNumber = this.getMaxLineNumber();
		if (this.invalidRange(maxLineNumber)) {
			if (maxLineNumber > 0) {
				return nls.localize('gotoLineLabelEmptyWithLimit', "Type a line number between 1 and {0} to navigate to", maxLineNumber);
			}

			return nls.localize('gotoLineLabelEmpty', "Type a line number to navigate to");
		}

		// Input valid, indicate action
		return this.column ? nls.localize('gotoLineColumnLabel', "Go to line {0} and character {1}", this.line, this.column) : nls.localize('gotoLineLabel', "Go to line {0}", this.line);
	}

	private invalidRange(maxLineNumber: number = this.getMaxLineNumber()): boolean {
		return !this.line || !types.isNumber(this.line) || (maxLineNumber > 0 && types.isNumber(this.line) && this.line > maxLineNumber);
	}

	private getMaxLineNumber(): number {
		const editor = this.editorService.getActiveEditor();
		const editorControl = <IEditor>editor.getControl();
		let model = editorControl.getModel();
		if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
			model = (<IDiffEditorModel>model).modified; // Support for diff editor models
		}

		return model && types.isFunction((<ITextModel>model).getLineCount) ? (<ITextModel>model).getLineCount() : -1;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	public getInput(): IEditorInput {
		return this.editorService.getActiveEditorInput();
	}

	public getOptions(pinned?: boolean): ITextEditorOptions {
		return {
			selection: this.toSelection(),
			pinned
		};
	}

	public runOpen(context: IEntryRunContext): boolean {

		// No-op if range is not valid
		if (this.invalidRange()) {
			return false;
		}

		// Check for sideBySide use
		const sideBySide = context.keymods.ctrlCmd;
		if (sideBySide) {
			this.editorService.openEditor(this.getInput(), this.getOptions(context.keymods.alt), true).done(null, errors.onUnexpectedError);
		}

		// Apply selection and focus
		const range = this.toSelection();
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editor = <IEditor>activeEditor.getControl();
			editor.setSelection(range);
			editor.revealRangeInCenter(range, ScrollType.Smooth);
		}

		return true;
	}

	public runPreview(): boolean {

		// No-op if range is not valid
		if (this.invalidRange()) {
			this.handler.clearDecorations();

			return false;
		}

		// Select Line Position
		const range = this.toSelection();
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorControl = <IEditor>activeEditor.getControl();
			editorControl.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate if possible
			if (types.isFunction(editorControl.changeDecorations)) {
				this.handler.decorateOutline(range, editorControl, activeEditor.position);
			}
		}

		return false;
	}

	private toSelection(): IRange {
		return {
			startLineNumber: this.line,
			startColumn: this.column || 1,
			endLineNumber: this.line,
			endColumn: this.column || 1
		};
	}
}

interface IEditorLineDecoration {
	rangeHighlightId: string;
	lineDecorationId: string;
	position: Position;
}

export class GotoLineHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.line';

	private rangeHighlightDecorationId: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState;

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super();
	}

	public getAriaLabel(): string {
		return nls.localize('gotoLineHandlerAriaLabel', "Type a line number to navigate to.");
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			const editor = this.editorService.getActiveEditor();
			this.lastKnownEditorViewState = (<IEditor>editor.getControl()).saveViewState();
		}

		return TPromise.as(new QuickOpenModel([new GotoLineEntry(searchValue, this.editorService, this)]));
	}

	public canRun(): boolean | string {
		const canRun = getCodeEditor(this.editorService.getActiveEditor()) !== null;

		return canRun ? true : nls.localize('cannotRunGotoLine', "Open a text file first to go to a line");
	}

	public decorateOutline(range: IRange, editor: IEditor, position: Position): void {
		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			const deleteDecorations: string[] = [];

			if (this.rangeHighlightDecorationId) {
				deleteDecorations.push(this.rangeHighlightDecorationId.lineDecorationId);
				deleteDecorations.push(this.rangeHighlightDecorationId.rangeHighlightId);
				this.rangeHighlightDecorationId = null;
			}

			const newDecorations: IModelDeltaDecoration[] = [
				// rangeHighlight at index 0
				{
					range: range,
					options: {
						className: 'rangeHighlight',
						isWholeLine: true
					}
				},

				// lineDecoration at index 1
				{
					range: range,
					options: {
						overviewRuler: {
							color: themeColorFromId(overviewRulerRangeHighlight),
							darkColor: themeColorFromId(overviewRulerRangeHighlight),
							position: OverviewRulerLane.Full
						}
					}
				}
			];

			const decorations = changeAccessor.deltaDecorations(deleteDecorations, newDecorations);
			const rangeHighlightId = decorations[0];
			const lineDecorationId = decorations[1];

			this.rangeHighlightDecorationId = {
				rangeHighlightId: rangeHighlightId,
				lineDecorationId: lineDecorationId,
				position: position
			};
		});
	}

	public clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editorService.getVisibleEditors().forEach((editor) => {
				if (editor.position === this.rangeHighlightDecorationId.position) {
					const editorControl = <IEditor>editor.getControl();
					editorControl.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
						changeAccessor.deltaDecorations([
							this.rangeHighlightDecorationId.lineDecorationId,
							this.rangeHighlightDecorationId.rangeHighlightId
						], []);
					});
				}
			});

			this.rangeHighlightDecorationId = null;
		}
	}

	public onClose(canceled: boolean): void {

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				const editor = <IEditor>activeEditor.getControl();
				editor.restoreViewState(this.lastKnownEditorViewState);
			}
		}

		this.lastKnownEditorViewState = null;
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: searchValue.trim().length > 0
		};
	}
}
