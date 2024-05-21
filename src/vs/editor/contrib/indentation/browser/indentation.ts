/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, IActionOptions, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { EditorAutoIndentStrategy, EditorOption } from 'vs/editor/common/config/editorOptions';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { EndOfLineSequence, ITextModel } from 'vs/editor/common/model';
import { TextEdit } from 'vs/editor/common/languages';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IndentConsts } from 'vs/editor/common/languages/supports/indentRules';
import { IModelService } from 'vs/editor/common/services/model';
import * as indentUtils from 'vs/editor/contrib/indentation/common/indentUtils';
import * as nls from 'vs/nls';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { getGoodIndentForLine, getIndentMetadata } from 'vs/editor/common/languages/autoIndent';
import { getReindentEditOperations } from '../common/indentation';

export class IndentationToSpacesAction extends EditorAction {
	public static readonly ID = 'editor.action.indentationToSpaces';

	constructor() {
		super({
			id: IndentationToSpacesAction.ID,
			label: nls.localize('indentationToSpaces', "Convert Indentation to Spaces"),
			alias: 'Convert Indentation to Spaces',
			precondition: EditorContextKeys.writable,
			metadata: {
				description: nls.localize2('indentationToSpacesDescription', "Convert the tab indentation to spaces."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const model = editor.getModel();
		if (!model) {
			return;
		}
		const modelOpts = model.getOptions();
		const selection = editor.getSelection();
		if (!selection) {
			return;
		}
		const command = new IndentationToSpacesCommand(selection, modelOpts.tabSize);

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
			precondition: EditorContextKeys.writable,
			metadata: {
				description: nls.localize2('indentationToTabsDescription', "Convert the spaces indentation to tabs."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const model = editor.getModel();
		if (!model) {
			return;
		}
		const modelOpts = model.getOptions();
		const selection = editor.getSelection();
		if (!selection) {
			return;
		}
		const command = new IndentationToTabsCommand(selection, modelOpts.tabSize);

		editor.pushUndoStop();
		editor.executeCommands(this.id, [command]);
		editor.pushUndoStop();

		model.updateOptions({
			insertSpaces: false
		});
	}
}

export class ChangeIndentationSizeAction extends EditorAction {

	constructor(private readonly insertSpaces: boolean, private readonly displaySizeOnly: boolean, opts: IActionOptions) {
		super(opts);
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const quickInputService = accessor.get(IQuickInputService);
		const modelService = accessor.get(IModelService);

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
		const modelOpts = model.getOptions();
		const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
			id: n.toString(),
			label: n.toString(),
			// add description for tabSize value set in the configuration
			description: (
				n === creationOpts.tabSize && n === modelOpts.tabSize
					? nls.localize('configuredTabSize', "Configured Tab Size")
					: n === creationOpts.tabSize
						? nls.localize('defaultTabSize', "Default Tab Size")
						: n === modelOpts.tabSize
							? nls.localize('currentTabSize', "Current Tab Size")
							: undefined
			)
		}));

		// auto focus the tabSize set for the current editor
		const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);

		setTimeout(() => {
			quickInputService.pick(picks, { placeHolder: nls.localize({ key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File"), activeItem: picks[autoFocusIndex] }).then(pick => {
				if (pick) {
					if (model && !model.isDisposed()) {
						const pickedVal = parseInt(pick.label, 10);
						if (this.displaySizeOnly) {
							model.updateOptions({
								tabSize: pickedVal
							});
						} else {
							model.updateOptions({
								tabSize: pickedVal,
								indentSize: pickedVal,
								insertSpaces: this.insertSpaces
							});
						}
					}
				}
			});
		}, 50/* quick input is sensitive to being opened so soon after another */);
	}
}

export class IndentUsingTabs extends ChangeIndentationSizeAction {

	public static readonly ID = 'editor.action.indentUsingTabs';

	constructor() {
		super(false, false, {
			id: IndentUsingTabs.ID,
			label: nls.localize('indentUsingTabs', "Indent Using Tabs"),
			alias: 'Indent Using Tabs',
			precondition: undefined,
			metadata: {
				description: nls.localize2('indentUsingTabsDescription', "Use indentation with tabs."),
			}
		});
	}
}

export class IndentUsingSpaces extends ChangeIndentationSizeAction {

	public static readonly ID = 'editor.action.indentUsingSpaces';

	constructor() {
		super(true, false, {
			id: IndentUsingSpaces.ID,
			label: nls.localize('indentUsingSpaces', "Indent Using Spaces"),
			alias: 'Indent Using Spaces',
			precondition: undefined,
			metadata: {
				description: nls.localize2('indentUsingSpacesDescription', "Use indentation with spaces."),
			}
		});
	}
}

export class ChangeTabDisplaySize extends ChangeIndentationSizeAction {

	public static readonly ID = 'editor.action.changeTabDisplaySize';

	constructor() {
		super(true, true, {
			id: ChangeTabDisplaySize.ID,
			label: nls.localize('changeTabDisplaySize', "Change Tab Display Size"),
			alias: 'Change Tab Display Size',
			precondition: undefined,
			metadata: {
				description: nls.localize2('changeTabDisplaySizeDescription', "Change the space size equivalent of the tab."),
			}
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
			precondition: undefined,
			metadata: {
				description: nls.localize2('detectIndentationDescription', "Detect the indentation from content."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const modelService = accessor.get(IModelService);

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
		model.detectIndentation(creationOpts.insertSpaces, creationOpts.tabSize);
	}
}

export class ReindentLinesAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.reindentlines',
			label: nls.localize('editor.reindentlines', "Reindent Lines"),
			alias: 'Reindent Lines',
			precondition: EditorContextKeys.writable,
			metadata: {
				description: nls.localize2('editor.reindentlinesDescription', "Reindent the lines of the editor."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);

		const model = editor.getModel();
		if (!model) {
			return;
		}
		const edits = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		if (edits.length > 0) {
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
			precondition: EditorContextKeys.writable,
			metadata: {
				description: nls.localize2('editor.reindentselectedlinesDescription', "Reindent the selected lines of the editor."),
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const selections = editor.getSelections();
		if (selections === null) {
			return;
		}

		const edits: ISingleEditOperation[] = [];

		for (const selection of selections) {
			let startLineNumber = selection.startLineNumber;
			let endLineNumber = selection.endLineNumber;

			if (startLineNumber !== endLineNumber && selection.endColumn === 1) {
				endLineNumber--;
			}

			if (startLineNumber === 1) {
				if (startLineNumber === endLineNumber) {
					continue;
				}
			} else {
				startLineNumber--;
			}

			const editOperations = getReindentEditOperations(model, languageConfigurationService, startLineNumber, endLineNumber);
			edits.push(...editOperations);
		}

		if (edits.length > 0) {
			editor.pushUndoStop();
			editor.executeEdits(this.id, edits);
			editor.pushUndoStop();
		}
	}
}

export class AutoIndentOnPasteCommand implements ICommand {

	private readonly _edits: { range: IRange; text: string; eol?: EndOfLineSequence }[];

	private readonly _initialSelection: Selection;
	private _selectionId: string | null;

	constructor(edits: TextEdit[], initialSelection: Selection) {
		this._initialSelection = initialSelection;
		this._edits = [];
		this._selectionId = null;

		for (const edit of edits) {
			if (edit.range && typeof edit.text === 'string') {
				this._edits.push(edit as { range: IRange; text: string; eol?: EndOfLineSequence });
			}
		}
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		for (const edit of this._edits) {
			builder.addEditOperation(Range.lift(edit.range), edit.text);
		}

		let selectionIsSet = false;
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
		return helper.getTrackedSelection(this._selectionId!);
	}
}

export class AutoIndentOnPaste implements IEditorContribution {
	public static readonly ID = 'editor.contrib.autoIndentOnPaste';

	private readonly callOnDispose = new DisposableStore();
	private readonly callOnModel = new DisposableStore();

	constructor(
		private readonly editor: ICodeEditor,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {

		this.callOnDispose.add(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.add(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.add(editor.onDidChangeModelLanguage(() => this.update()));
	}

	private update(): void {

		// clean up
		this.callOnModel.clear();

		// we are disabled
		if (this.editor.getOption(EditorOption.autoIndent) < EditorAutoIndentStrategy.Full || this.editor.getOption(EditorOption.formatOnPaste)) {
			return;
		}

		// no model
		if (!this.editor.hasModel()) {
			return;
		}

		this.callOnModel.add(this.editor.onDidPaste(({ range }) => {
			this.trigger(range);
		}));
	}

	public trigger(range: Range): void {
		const selections = this.editor.getSelections();
		if (selections === null || selections.length > 1) {
			return;
		}

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber)) {
			return;
		}
		const autoIndent = this.editor.getOption(EditorOption.autoIndent);
		const { tabSize, indentSize, insertSpaces } = model.getOptions();
		const textEdits: TextEdit[] = [];

		const indentConverter = {
			shiftIndent: (indentation: string) => {
				return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
			},
			unshiftIndent: (indentation: string) => {
				return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
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
			const indentOfFirstLine = getGoodIndentForLine(autoIndent, model, model.getLanguageId(), startLineNumber, indentConverter, this._languageConfigurationService);

			if (indentOfFirstLine !== null) {
				const oldIndentation = strings.getLeadingWhitespace(firstLineText);
				const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
				const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);

				if (newSpaceCnt !== oldSpaceCnt) {
					const newIndent = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
					textEdits.push({
						range: new Range(startLineNumber, 1, startLineNumber, oldIndentation.length + 1),
						text: newIndent
					});
					firstLineText = newIndent + firstLineText.substr(oldIndentation.length);
				} else {
					const indentMetadata = getIndentMetadata(model, startLineNumber, this._languageConfigurationService);

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
			const virtualModel = {
				tokenization: {
					getLineTokens: (lineNumber: number) => {
						return model.tokenization.getLineTokens(lineNumber);
					},
					getLanguageId: () => {
						return model.getLanguageId();
					},
					getLanguageIdAtPosition: (lineNumber: number, column: number) => {
						return model.getLanguageIdAtPosition(lineNumber, column);
					},
				},
				getLineContent: (lineNumber: number) => {
					if (lineNumber === firstLineNumber) {
						return firstLineText;
					} else {
						return model.getLineContent(lineNumber);
					}
				}
			};
			const indentOfSecondLine = getGoodIndentForLine(autoIndent, virtualModel, model.getLanguageId(), startLineNumber + 1, indentConverter, this._languageConfigurationService);
			if (indentOfSecondLine !== null) {
				const newSpaceCntOfSecondLine = indentUtils.getSpaceCnt(indentOfSecondLine, tabSize);
				const oldSpaceCntOfSecondLine = indentUtils.getSpaceCnt(strings.getLeadingWhitespace(model.getLineContent(startLineNumber + 1)), tabSize);

				if (newSpaceCntOfSecondLine !== oldSpaceCntOfSecondLine) {
					const spaceCntOffset = newSpaceCntOfSecondLine - oldSpaceCntOfSecondLine;
					for (let i = startLineNumber + 1; i <= range.endLineNumber; i++) {
						const lineContent = model.getLineContent(i);
						const originalIndent = strings.getLeadingWhitespace(lineContent);
						const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
						const newSpacesCnt = originalSpacesCnt + spaceCntOffset;
						const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);

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

		if (textEdits.length > 0) {
			this.editor.pushUndoStop();
			const cmd = new AutoIndentOnPasteCommand(textEdits, this.editor.getSelection()!);
			this.editor.executeCommand('autoIndentOnPaste', cmd);
			this.editor.pushUndoStop();
		}
	}

	private shouldIgnoreLine(model: ITextModel, lineNumber: number): boolean {
		model.tokenization.forceTokenization(lineNumber);
		const nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		if (nonWhitespaceColumn === 0) {
			return true;
		}
		const tokens = model.tokenization.getLineTokens(lineNumber);
		if (tokens.getCount() > 0) {
			const firstNonWhitespaceTokenIndex = tokens.findTokenIndexAtOffset(nonWhitespaceColumn);
			if (firstNonWhitespaceTokenIndex >= 0 && tokens.getStandardTokenType(firstNonWhitespaceTokenIndex) === StandardTokenType.Comment) {
				return true;
			}
		}

		return false;
	}

	public dispose(): void {
		this.callOnDispose.dispose();
		this.callOnModel.dispose();
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

	const spacesRegExp = new RegExp(spaces, 'gi');

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

	private selectionId: string | null = null;

	constructor(private readonly selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, true);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId!);
	}
}

export class IndentationToTabsCommand implements ICommand {

	private selectionId: string | null = null;

	constructor(private readonly selection: Selection, private tabSize: number) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		this.selectionId = builder.trackSelection(this.selection);
		getIndentationEditOperations(model, builder, this.tabSize, false);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId!);
	}
}

registerEditorContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(IndentationToSpacesAction);
registerEditorAction(IndentationToTabsAction);
registerEditorAction(IndentUsingTabs);
registerEditorAction(IndentUsingSpaces);
registerEditorAction(ChangeTabDisplaySize);
registerEditorAction(DetectIndentation);
registerEditorAction(ReindentLinesAction);
registerEditorAction(ReindentSelectedLinesAction);
