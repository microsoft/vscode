/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IEntryRunContext, Mode, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, EditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IEditor, IEditorViewState, IDiffEditorModel, ScrollType } from 'vs/editor/common/editorCommon';
import { OverviewRulerLane, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput, GroupIdentifier } from 'vs/workbench/common/editor';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IRange } from 'vs/editor/common/core/range';
import { overviewRulerRangeHighlight } from 'vs/editor/common/view/editorColorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IEditorOptions, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';

export const GOTO_LINE_PREFIX = ':';

export class GotoLineAction extends QuickOpenAction {

	static readonly ID = 'workbench.action.gotoLine';
	static readonly LABEL = nls.localize('gotoLine', "Go to Line...");

	constructor(actionId: string, actionLabel: string,
		@IQuickOpenService private readonly _quickOpenService: IQuickOpenService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(actionId, actionLabel, GOTO_LINE_PREFIX, _quickOpenService);
	}

	run(): Promise<void> {

		let activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (isDiffEditor(activeTextEditorWidget)) {
			activeTextEditorWidget = activeTextEditorWidget.getModifiedEditor();
		}
		let restoreOptions: IEditorOptions | null = null;

		if (isCodeEditor(activeTextEditorWidget)) {
			const config = activeTextEditorWidget.getConfiguration();
			if (config.viewInfo.renderLineNumbers === RenderLineNumbersType.Relative) {
				activeTextEditorWidget.updateOptions({
					lineNumbers: 'on'
				});
				restoreOptions = {
					lineNumbers: 'relative'
				};
			}
		}

		const result = super.run();

		if (restoreOptions) {
			Event.once(this._quickOpenService.onHide)(() => {
				activeTextEditorWidget.updateOptions(restoreOptions);
			});
		}

		return result;
	}
}

class GotoLineEntry extends EditorQuickOpenEntry {
	private line: number;
	private column: number;
	private handler: GotoLineHandler;

	constructor(line: string, editorService: IEditorService, handler: GotoLineHandler) {
		super(editorService);

		this.parseInput(line);
		this.handler = handler;
	}

	private parseInput(line: string) {
		const numbers = line.split(/,|:|#/).map(part => parseInt(part, 10)).filter(part => !isNaN(part));
		this.line = numbers[0];
		this.column = numbers[1];
	}

	getLabel(): string {

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
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;

		let model = activeTextEditorWidget.getModel();
		if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
			model = (<IDiffEditorModel>model).modified; // Support for diff editor models
		}

		return model && types.isFunction((<ITextModel>model).getLineCount) ? (<ITextModel>model).getLineCount() : -1;
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	getInput(): IEditorInput {
		return this.editorService.activeEditor;
	}

	getOptions(pinned?: boolean): ITextEditorOptions {
		return {
			selection: this.toSelection(),
			pinned
		};
	}

	runOpen(context: IEntryRunContext): boolean {

		// No-op if range is not valid
		if (this.invalidRange()) {
			return false;
		}

		// Check for sideBySide use
		const sideBySide = context.keymods.ctrlCmd;
		if (sideBySide) {
			this.editorService.openEditor(this.getInput(), this.getOptions(context.keymods.alt), SIDE_GROUP);
		}

		// Apply selection and focus
		const range = this.toSelection();
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			activeTextEditorWidget.setSelection(range);
			activeTextEditorWidget.revealRangeInCenter(range, ScrollType.Smooth);
		}

		return true;
	}

	runPreview(): boolean {

		// No-op if range is not valid
		if (this.invalidRange()) {
			this.handler.clearDecorations();

			return false;
		}

		// Select Line Position
		const range = this.toSelection();
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			activeTextEditorWidget.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate if possible
			if (types.isFunction(activeTextEditorWidget.changeDecorations)) {
				this.handler.decorateOutline(range, activeTextEditorWidget, this.editorService.activeControl.group);
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
	groupId: GroupIdentifier;
	rangeHighlightId: string;
	lineDecorationId: string;
}

export class GotoLineHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.line';

	private rangeHighlightDecorationId: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState;

	constructor(@IEditorService private readonly editorService: IEditorService) {
		super();
	}

	getAriaLabel(): string {
		return nls.localize('gotoLineHandlerAriaLabel', "Type a line number to navigate to.");
	}

	getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			this.lastKnownEditorViewState = activeTextEditorWidget.saveViewState();
		}

		return Promise.resolve(new QuickOpenModel([new GotoLineEntry(searchValue, this.editorService, this)]));
	}

	canRun(): boolean | string {
		const canRun = !!this.editorService.activeTextEditorWidget;

		return canRun ? true : nls.localize('cannotRunGotoLine', "Open a text file first to go to a line");
	}

	decorateOutline(range: IRange, editor: IEditor, group: IEditorGroup): void {
		editor.changeDecorations(changeAccessor => {
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
							position: OverviewRulerLane.Full
						}
					}
				}
			];

			const decorations = changeAccessor.deltaDecorations(deleteDecorations, newDecorations);
			const rangeHighlightId = decorations[0];
			const lineDecorationId = decorations[1];

			this.rangeHighlightDecorationId = {
				groupId: group.id,
				rangeHighlightId: rangeHighlightId,
				lineDecorationId: lineDecorationId,
			};
		});
	}

	clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editorService.visibleControls.forEach(editor => {
				if (editor.group.id === this.rangeHighlightDecorationId.groupId) {
					const editorControl = <IEditor>editor.getControl();
					editorControl.changeDecorations(changeAccessor => {
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

	onClose(canceled: boolean): void {

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			if (activeTextEditorWidget) {
				activeTextEditorWidget.restoreViewState(this.lastKnownEditorViewState);
			}
		}

		this.lastKnownEditorViewState = null;
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: searchValue.trim().length > 0
		};
	}
}
