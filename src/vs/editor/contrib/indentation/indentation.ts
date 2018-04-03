/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import { IEditorContribution, ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, ServicesAccessor, IActionOptions, EditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { TextEdit, StandardTokenType } from 'vs/editor/common/modes';
import * as IndentUtil from './indentUtils';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IndentConsts } from 'vs/editor/common/modes/supports/indentRules';

export function shiftIndent(tabSize: number, indentation: string, count?: number): string {
	count = count || 1;
	let desiredIndentCount = ShiftCommand.shiftIndentCount(indentation, indentation.length + count, tabSize);
	let newIndentation = '';
	for (let i = 0; i < desiredIndentCount; i++) {
		newIndentation += '\t';
	}

	return newIndentation;
}

export function unshiftIndent(tabSize: number, indentation: string, count?: number): string {
	count = count || 1;
	let desiredIndentCount = ShiftCommand.unshiftIndentCount(indentation, indentation.length + count, tabSize);
	let newIndentation = '';
	for (let i = 0; i < desiredIndentCount; i++) {
		newIndentation += '\t';
	}

	return newIndentation;
}

export function getReindentEditOperations(model: ITextModel, startLineNumber: number, endLineNumber: number, inheritedIndent?: string): IIdentifiedSingleEditOperation[] {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return undefined;
	}

	let indentationRules = LanguageConfigurationRegistry.getIndentationRules(model.getLanguageIdentifier().id);
	if (!indentationRules) {
		return undefined;
	}

	endLineNumber = Math.min(endLineNumber, model.getLineCount());

	// Skip `unIndentedLinePattern` lines
	while (startLineNumber <= endLineNumber) {
		if (!indentationRules.unIndentedLinePattern) {
			break;
		}

		let text = model.getLineContent(startLineNumber);
		if (!indentationRules.unIndentedLinePattern.test(text)) {
			break;
		}

		startLineNumber++;
	}

	if (startLineNumber > endLineNumber - 1) {
		return undefined;
	}

	let { tabSize, insertSpaces } = model.getOptions();
	let indentEdits = [];

	// indentation being passed to lines below
	let globalIndent: string;

	// Calculate indentation for the first line
	// If there is no passed-in indentation, we use the indentation of the first line as base.
	let currentLineText = model.getLineContent(startLineNumber);
	let adjustedLineContent = currentLineText;
	if (inheritedIndent !== undefined && inheritedIndent !== null) {
		globalIndent = inheritedIndent;
		let oldIndentation = strings.getLeadingWhitespace(currentLineText);

		adjustedLineContent = globalIndent + currentLineText.substring(oldIndentation.length);
		if (indentationRules.decreaseIndentPattern && indentationRules.decreaseIndentPattern.test(adjustedLineContent)) {
			globalIndent = unshiftIndent(tabSize, globalIndent);
			adjustedLineContent = globalIndent + currentLineText.substring(oldIndentation.length);

		}
		if (currentLineText !== adjustedLineContent) {
			indentEdits.push(EditOperation.replace(new Selection(startLineNumber, 1, startLineNumber, oldIndentation.length + 1), TextModel.normalizeIndentation(globalIndent, tabSize, insertSpaces)));
		}
	} else {
		globalIndent = strings.getLeadingWhitespace(currentLineText);
	}

	// idealIndentForNextLine doesn't equal globalIndent when there is a line matching `indentNextLinePattern`.
	let idealIndentForNextLine: string = globalIndent;

	if (indentationRules.increaseIndentPattern && indentationRules.increaseIndentPattern.test(adjustedLineContent)) {
		idealIndentForNextLine = shiftIndent(tabSize, idealIndentForNextLine);
		globalIndent = shiftIndent(tabSize, globalIndent);
	}
	else if (indentationRules.indentNextLinePattern && indentationRules.indentNextLinePattern.test(adjustedLineContent)) {
		idealIndentForNextLine = shiftIndent(tabSize, idealIndentForNextLine);
	}

	startLineNumber++;

	// Calculate indentation adjustment for all following lines
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		let text = model.getLineContent(lineNumber);
		let oldIndentation = strings.getLeadingWhitespace(text);
		let adjustedLineContent = idealIndentForNextLine + text.substring(oldIndentation.length);

		if (indentationRules.decreaseIndentPattern && indentationRules.decreaseIndentPattern.test(adjustedLineContent)) {
			idealIndentForNextLine = unshiftIndent(tabSize, idealIndentForNextLine);
			globalIndent = unshiftIndent(tabSize, globalIndent);
		}

		if (oldIndentation !== idealIndentForNextLine) {
			indentEdits.push(EditOperation.replace(new Selection(lineNumber, 1, lineNumber, oldIndentation.length + 1), TextModel.normalizeIndentation(idealIndentForNextLine, tabSize, insertSpaces)));
		}

		// calculate idealIndentForNextLine
		if (indentationRules.unIndentedLinePattern && indentationRules.unIndentedLinePattern.test(text)) {
			// In reindent phase, if the line matches `unIndentedLinePattern` we inherit indentation from above lines
			// but don't change globalIndent and idealIndentForNextLine.
			continue;
		} else if (indentationRules.increaseIndentPattern && indentationRules.increaseIndentPattern.test(adjustedLineContent)) {
			globalIndent = shiftIndent(tabSize, globalIndent);
			idealIndentForNextLine = globalIndent;
		} else if (indentationRules.indentNextLinePattern && indentationRules.indentNextLinePattern.test(adjustedLineContent)) {
			idealIndentForNextLine = shiftIndent(tabSize, idealIndentForNextLine);
		} else {
			idealIndentForNextLine = globalIndent;
		}
	}

	return indentEdits;
}

export class IndentationToSpacesAction extends EditorAction {
	public static readonly ID = 'editor.action.indentationToSpaces';

	constructor() {
		super({
			id: IndentationToSpacesAction.ID,
			label: nls.localize('indentationToSpaces', "Convert Indentation to Spaces"),
			alias: 'Convert Indentation to Spaces',
			precondition: EditorContextKeys.writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let modelOpts = model.getOptions();
		const command = new IndentationToSpacesCommand(editor.getSelection(), modelOpts.tabSize);

		editor.pushUndoStop();
		editor.executeCommands(this.id, [command]);
		editor.pushUndoStop();

		model.updateOptions({
			insertSpaces: true
		});
	}
}

export class IndentationToTabsAction extends EditorAction {
	public static readonly ID = 'editor.action.indentationToTabs';

	constructor() {
		super({
			id: IndentationToTabsAction.ID,
			label: nls.localize('indentationToTabs', "Convert Indentation to Tabs"),
			alias: 'Convert Indentation to Tabs',
			precondition: EditorContextKeys.writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let modelOpts = model.getOptions();
		const command = new IndentationToTabsCommand(editor.getSelection(), modelOpts.tabSize);

		editor.pushUndoStop();
		editor.executeCommands(this.id, [command]);
		editor.pushUndoStop();

		model.updateOptions({
			insertSpaces: false
		});
	}
}

export class ChangeIndentationSizeAction extends EditorAction {

	constructor(private insertSpaces: boolean, opts: IActionOptions) {
		super(opts);
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);
		const modelService = accessor.get(IModelService);

		let model = editor.getModel();
		if (!model) {
			return undefined;
		}

		let creationOpts = modelService.getCreationOptions(model.getLanguageIdentifier().language, model.uri, model.isForSimpleWidget);
		const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
			id: n.toString(),
			label: n.toString(),
			// add description for tabSize value set in the configuration
			description: n === creationOpts.tabSize ? nls.localize('configuredTabSize', "Configured Tab Size") : null
		}));

		// auto focus the tabSize set for the current editor
		const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);

		return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() =>
			quickOpenService.pick(picks, { placeHolder: nls.localize({ key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File"), autoFocus: { autoFocusIndex } }).then(pick => {
				if (pick) {
					model.updateOptions({
						tabSize: parseInt(pick.label, 10),
						insertSpaces: this.insertSpaces
					});
				}
			})
		);
	}
}

export class IndentUsingTabs extends ChangeIndentationSizeAction {

	public static readonly ID = 'editor.action.indentUsingTabs';

	constructor() {
		super(false, {
			id: IndentUsingTabs.ID,
			label: nls.localize('indentUsingTabs', "Indent Using Tabs"),
			alias: 'Indent Using Tabs',
			precondition: null
		});
	}
}

export class IndentUsingSpaces extends ChangeIndentationSizeAction {

	public static readonly ID = 'editor.action.indentUsingSpaces';

	constructor() {
		super(true, {
			id: IndentUsingSpaces.ID,
			label: nls.localize('indentUsingSpaces', "Indent Using Spaces"),
			alias: 'Indent Using Spaces',
			precondition: null
		});
	}
}

export class DetectIndentation extends EditorAction {

	public static readonly ID = 'editor.action.detectIndentation';

	constructor() {
		super({
			id: DetectIndentation.ID,
			label: nls.localize('detectIndentation', "Detect Indentation from Content"),
			alias: 'Detect Indentation from Content',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const modelService = accessor.get(IModelService);

		let model = editor.getModel();
		if (!model) {
			return;
		}

		let creationOpts = modelService.getCreationOptions(model.getLanguageIdentifier().language, model.uri, model.isForSimpleWidget);
		model.detectIndentation(creationOpts.insertSpaces, creationOpts.tabSize);
	}
}

export class ReindentLinesAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.reindentlines',
			label: nls.localize('editor.reindentlines', "Reindent Lines"),
			alias: 'Reindent Lines',
			precondition: EditorContextKeys.writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let edits = getReindentEditOperations(model, 1, model.getLineCount());
		if (edits) {
			editor.pushUndoStop();
			editor.executeEdits(this.id, edits);
			editor.pushUndoStop();
		}
	}
}

export class ReindentSelectedLinesAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.reindentselectedlines',
			label: nls.localize('editor.reindentselectedlines', "Reindent Selected Lines"),
			alias: 'Reindent Selected Lines',
			precondition: EditorContextKeys.writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let edits: IIdentifiedSingleEditOperation[] = [];

		for (let selection of editor.getSelections()) {
			console.log(selection);
			let startLineNumber = selection.startLineNumber;
			let endLineNumber = selection.endLineNumber;
			if (startLineNumber !== endLineNumber && selection.endColumn === 1) {
				endLineNumber--;
			}
			if (startLineNumber === 1) {
				if (startLineNumber === endLineNumber) { continue; }
			} else {
				startLineNumber--;
			}
			let editOperations = getReindentEditOperations(model, startLineNumber, endLineNumber) || [];
			for (let editOp of editOperations) {
				edits.push(editOp);
			}
		}

		if (edits) {
			editor.pushUndoStop();
			editor.executeEdits(this.id, edits);
			editor.pushUndoStop();
		}
	}
}

export class AutoIndentOnPasteCommand implements ICommand {

	private _edits: TextEdit[];

	private _initialSelection: Selection;
	private _selectionId: string;

	constructor(edits: TextEdit[], initialSelection: Selection) {
		this._initialSelection = initialSelection;
		this._edits = [];

		for (let edit of edits) {
			if (edit.range && typeof edit.text === 'string') {
				this._edits.push(edit);
			}
		}
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		for (let edit of this._edits) {
			builder.addEditOperation(Range.lift(edit.range), edit.text);
		}

		var selectionIsSet = false;
		if (Array.isArray(this._edits) && this._edits.length === 1 && this._initialSelection.isEmpty()) {
			if (this._edits[0].range.startColumn === this._initialSelection.endColumn &&
				this._edits[0].range.startLineNumber === this._initialSelection.endLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, true);
			} else if (this._edits[0].range.endColumn === this._initialSelection.startColumn &&
				this._edits[0].range.endLineNumber === this._initialSelection.startLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, false);
			}
		}

		if (!selectionIsSet) {
			this._selectionId = builder.trackSelection(this._initialSelection);
		}
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId);
	}
}

export class AutoIndentOnPaste implements IEditorContribution {
	private static readonly ID = 'editor.contrib.autoIndentOnPaste';

	private editor: ICodeEditor;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().autoIndent || this.editor.getConfiguration().contribInfo.formatOnPaste) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		this.callOnModel.push(this.editor.onDidPaste((range: Range) => {
			this.trigger(range);
		}));
	}

	private trigger(range: Range): void {
		if (this.editor.getSelections().length > 1) {
			return;
		}

		const model = this.editor.getModel();
		if (!model.isCheapToTokenize(range.getStartPosition().lineNumber)) {
			return;
		}
		const { tabSize, insertSpaces } = model.getOptions();
		this.editor.pushUndoStop();
		let textEdits: TextEdit[] = [];

		let indentConverter = {
			shiftIndent: (indentation: string) => {
				let desiredIndentCount = ShiftCommand.shiftIndentCount(indentation, indentation.length + 1, tabSize);
				let newIndentation = '';
				for (let i = 0; i < desiredIndentCount; i++) {
					newIndentation += '\t';
				}

				return newIndentation;
			},
			unshiftIndent: (indentation: string) => {
				let desiredIndentCount = ShiftCommand.unshiftIndentCount(indentation, indentation.length + 1, tabSize);
				let newIndentation = '';
				for (let i = 0; i < desiredIndentCount; i++) {
					newIndentation += '\t';
				}

				return newIndentation;
			}
		};

		let startLineNumber = range.startLineNumber;

		while (startLineNumber <= range.endLineNumber) {
			if (this.shouldIgnoreLine(model, startLineNumber)) {
				startLineNumber++;
				continue;
			}
			break;
		}

		if (startLineNumber > range.endLineNumber) {
			return;
		}

		let firstLineText = model.getLineContent(startLineNumber);
		if (!/\S/.test(firstLineText.substring(0, range.startColumn - 1))) {
			let indentOfFirstLine = LanguageConfigurationRegistry.getGoodIndentForLine(model, model.getLanguageIdentifier().id, startLineNumber, indentConverter);

			if (indentOfFirstLine !== null) {
				let oldIndentation = strings.getLeadingWhitespace(firstLineText);
				let newSpaceCnt = IndentUtil.getSpaceCnt(indentOfFirstLine, tabSize);
				let oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndentation, tabSize);

				if (newSpaceCnt !== oldSpaceCnt) {
					let newIndent = IndentUtil.generateIndent(newSpaceCnt, tabSize, insertSpaces);
					textEdits.push({
						range: new Range(startLineNumber, 1, startLineNumber, oldIndentation.length + 1),
						text: newIndent
					});
					firstLineText = newIndent + firstLineText.substr(oldIndentation.length);
				} else {
					let indentMetadata = LanguageConfigurationRegistry.getIndentMetadata(model, startLineNumber);

					if (indentMetadata === 0 || indentMetadata === IndentConsts.UNINDENT_MASK) {
						// we paste content into a line where only contains whitespaces
						// after pasting, the indentation of the first line is already correct
						// the first line doesn't match any indentation rule
						// then no-op.
						return;
					}
				}
			}
		}

		const firstLineNumber = startLineNumber;

		// ignore empty or ignored lines
		while (startLineNumber < range.endLineNumber) {
			if (!/\S/.test(model.getLineContent(startLineNumber + 1))) {
				startLineNumber++;
				continue;
			}
			break;
		}

		if (startLineNumber !== range.endLineNumber) {
			let virtualModel = {
				getLineTokens: (lineNumber: number) => {
					return model.getLineTokens(lineNumber);
				},
				getLanguageIdentifier: () => {
					return model.getLanguageIdentifier();
				},
				getLanguageIdAtPosition: (lineNumber: number, column: number) => {
					return model.getLanguageIdAtPosition(lineNumber, column);
				},
				getLineContent: (lineNumber: number) => {
					if (lineNumber === firstLineNumber) {
						return firstLineText;
					} else {
						return model.getLineContent(lineNumber);
					}
				}
			};
			let indentOfSecondLine = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdentifier().id, startLineNumber + 1, indentConverter);
			if (indentOfSecondLine !== null) {
				let newSpaceCntOfSecondLine = IndentUtil.getSpaceCnt(indentOfSecondLine, tabSize);
				let oldSpaceCntOfSecondLine = IndentUtil.getSpaceCnt(strings.getLeadingWhitespace(model.getLineContent(startLineNumber + 1)), tabSize);

				if (newSpaceCntOfSecondLine !== oldSpaceCntOfSecondLine) {
					let spaceCntOffset = newSpaceCntOfSecondLine - oldSpaceCntOfSecondLine;
					for (let i = startLineNumber + 1; i <= range.endLineNumber; i++) {
						let lineContent = model.getLineContent(i);
						let originalIndent = strings.getLeadingWhitespace(lineContent);
						let originalSpacesCnt = IndentUtil.getSpaceCnt(originalIndent, tabSize);
						let newSpacesCnt = originalSpacesCnt + spaceCntOffset;
						let newIndent = IndentUtil.generateIndent(newSpacesCnt, tabSize, insertSpaces);

						if (newIndent !== originalIndent) {
							textEdits.push({
								range: new Range(i, 1, i, originalIndent.length + 1),
								text: newIndent
							});
						}
					}
				}
			}
		}

		let cmd = new AutoIndentOnPasteCommand(textEdits, this.editor.getSelection());
		this.editor.executeCommand('autoIndentOnPaste', cmd);
		this.editor.pushUndoStop();
	}

	private shouldIgnoreLine(model: ITextModel, lineNumber: number): boolean {
		model.forceTokenization(lineNumber);
		let nonWhiteSpaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		if (nonWhiteSpaceColumn === 0) {
			return true;
		}
		let tokens = model.getLineTokens(lineNumber);
		if (tokens.getCount() > 0) {
			let firstNonWhitespaceTokenIndex = tokens.findTokenIndexAtOffset(nonWhiteSpaceColumn);
			if (firstNonWhitespaceTokenIndex >= 0 && tokens.getStandardTokenType(firstNonWhitespaceTokenIndex) === StandardTokenType.Comment) {
				return true;
			}
		}

		return false;
	}

	public getId(): string {
		return AutoIndentOnPaste.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

function getIndentationEditOperations(model: ITextModel, builder: IEditOperationBuilder, tabSize: number, tabsToSpaces: boolean): void {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return;
	}

	let spaces = '';
	for (let i = 0; i < tabSize; i++) {
		spaces += ' ';
	}

	let spacesRegExp = new RegExp(spaces, 'gi');

	for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		if (lastIndentationColumn === 0) {
			lastIndentationColumn = model.getLineMaxColumn(lineNumber);
		}

		if (lastIndentationColumn === 1) {
			continue;
		}

		const originalIndentationRange = new Range(lineNumber, 1, lineNumber, lastIndentationColumn);
		const originalIndentation = model.getValueInRange(originalIndentationRange);
		const newIndentation = (
			tabsToSpaces
				? originalIndentation.replace(/\t/ig, spaces)
				: originalIndentation.replace(spacesRegExp, '\t')
		);

		builder.addEditOperation(originalIndentationRange, newIndentation);
	}
}

export class IndentationToSpacesCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, true);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

export class IndentationToTabsCommand implements ICommand {

	private selectionId: string;

	constructor(private selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, false);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

registerEditorContribution(AutoIndentOnPaste);
registerEditorAction(IndentationToSpacesAction);
registerEditorAction(IndentationToTabsAction);
registerEditorAction(IndentUsingTabs);
registerEditorAction(IndentUsingSpaces);
registerEditorAction(DetectIndentation);
registerEditorAction(ReindentLinesAction);
registerEditorAction(ReindentSelectedLinesAction);