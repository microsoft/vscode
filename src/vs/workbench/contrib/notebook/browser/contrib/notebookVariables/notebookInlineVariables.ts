/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { format } from '../../../../../../base/common/strings.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { StandardTokenType } from '../../../../../../editor/common/encodedTokenAttributes.js';
import { InlineValueContext, InlineValueText, InlineValueVariableLookup } from '../../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { createInlineValueDecoration } from '../../../../debug/browser/debugEditorContribution.js';
import { IDebugService, State } from '../../../../debug/common/debug.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { ICellExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { INotebookKernelService, VariablesResult } from '../../../common/notebookKernelService.js';
import { INotebookActionContext, NotebookAction } from '../../controller/coreActions.js';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';

class InlineSegment {
	constructor(public column: number, public text: string) {
	}
}

export class NotebookInlineVariablesController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.inlineVariablesController';

	private cellDecorationIds = new Map<ICellViewModel, string[]>();
	private cellContentListeners = new ResourceMap<IDisposable>();

	private currentCancellationTokenSources = new ResourceMap<CancellationTokenSource>();

	private static readonly MAX_CELL_LINES = 5000; // Skip extremely large cells

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDebugService private readonly debugService: IDebugService,
	) {
		super();

		this._register(this.notebookExecutionStateService.onDidChangeExecution(async e => {
			const inlineValuesSetting = this.configurationService.getValue<'on' | 'auto' | 'off'>(NotebookSetting.notebookInlineValues);
			if (inlineValuesSetting === 'off') {
				return;
			}

			if (e.type === NotebookExecutionType.cell) {
				await this.updateInlineVariables(e);
			}
		}));

		this._register(Event.runAndSubscribe(this.configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(NotebookSetting.notebookInlineValues)) {
				if (this.configurationService.getValue<'on' | 'auto' | 'off'>(NotebookSetting.notebookInlineValues) === 'off') {
					this.clearNotebookInlineDecorations();
				}
			}
		}));
	}

	private async updateInlineVariables(event: ICellExecutionStateChangedEvent): Promise<void> {
		if (event.changed) { // undefined -> execution was completed, so return on all else. no code should execute until we know it's an execution completion
			return;
		}

		const cell = this.notebookEditor.getCellByHandle(event.cellHandle);
		if (!cell) {
			return;
		}

		// Cancel any ongoing request in this cell
		const existingSource = this.currentCancellationTokenSources.get(cell.uri);
		if (existingSource) {
			existingSource.cancel();
		}

		// Create a new CancellationTokenSource for the new request per cell
		this.currentCancellationTokenSources.set(cell.uri, new CancellationTokenSource());
		const token = this.currentCancellationTokenSources.get(cell.uri)!.token;

		if (this.debugService.state !== State.Inactive) {
			this._clearNotebookInlineDecorations();
			return;
		}

		if (!this.notebookEditor.textModel?.uri || !isEqual(this.notebookEditor.textModel.uri, event.notebook)) {
			return;
		}

		const model = await cell.resolveTextModel();
		if (!model) {
			return;
		}

		const inlineValuesSetting = this.configurationService.getValue<'on' | 'auto' | 'off'>(NotebookSetting.notebookInlineValues);
		const hasInlineValueProvider = this.languageFeaturesService.inlineValuesProvider.has(model);

		// Skip if setting is off or if auto and no provider is registered
		if (inlineValuesSetting === 'off' || (inlineValuesSetting === 'auto' && !hasInlineValueProvider)) {
			return;
		}

		this.clearCellInlineDecorations(cell);

		const inlineDecorations: IModelDeltaDecoration[] = [];

		if (hasInlineValueProvider) {
			// use extension based provider, borrowed from https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L679
			const lastLine = model.getLineCount();
			const lastColumn = model.getLineMaxColumn(lastLine);
			const ctx: InlineValueContext = {
				frameId: 0, // ignored, we won't have a stack from since not in a debug session
				stoppedLocation: new Range(lastLine, lastColumn, lastLine, lastColumn) // executing cell by cell, so "stopped" location would just be the end of document
			};

			const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
			const lineDecorations = new Map<number, InlineSegment[]>();

			const fullCellRange = new Range(1, 1, lastLine, lastColumn);

			const promises = providers.flatMap(provider => Promise.resolve(provider.provideInlineValues(model, fullCellRange, ctx, token)).then(async (result) => {
				if (!result) {
					return;
				}

				const notebook = this.notebookEditor.textModel;
				if (!notebook) {
					return;
				}

				const kernel = this.notebookKernelService.getMatchingKernel(notebook);
				const kernelVars: VariablesResult[] = [];
				if (result.some(iv => iv.type === 'variable')) { // if anyone will need a lookup, get vars now to avoid needing to do it multiple times
					if (!this.notebookEditor.hasModel()) {
						return; // should not happen, a cell will be executed
					}
					const variables = kernel.selected?.provideVariables(event.notebook, undefined, 'named', 0, token);
					if (variables) {
						for await (const v of variables) {
							kernelVars.push(v);
						}
					}
				}

				for (const iv of result) {
					let text: string | undefined = undefined;
					switch (iv.type) {
						case 'text':
							text = (iv as InlineValueText).text;
							break;
						case 'variable': {
							const name = (iv as InlineValueVariableLookup).variableName;
							if (!name) {
								continue; // skip to next var, no valid name to lookup with
							}
							const value = kernelVars.find(v => v.name === name)?.value;
							if (!value) {
								continue;
							}
							text = format('{0} = {1}', name, value);
							break;
						}
						case 'expression': {
							continue; // no active debug session, so evaluate would break
						}
					}

					if (text) {
						const line = iv.range.startLineNumber;
						let lineSegments = lineDecorations.get(line);
						if (!lineSegments) {
							lineSegments = [];
							lineDecorations.set(line, lineSegments);
						}
						if (!lineSegments.some(iv => iv.text === text)) { // de-dupe
							lineSegments.push(new InlineSegment(iv.range.startColumn, text));
						}
					}
				}
			}, err => {
				onUnexpectedExternalError(err);
			}));

			await Promise.all(promises);

			// sort line segments and concatenate them into a decoration
			lineDecorations.forEach((segments, line) => {
				if (segments.length > 0) {
					segments.sort((a, b) => a.column - b.column);
					const text = segments.map(s => s.text).join(', ');
					const editorWidth = cell.layoutInfo.editorWidth;
					const fontInfo = cell.layoutInfo.fontInfo;
					if (fontInfo && cell.textModel) {
						const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
						const lineLength = cell.textModel.getLineLength(line);
						const available = Math.max(0, base - lineLength);
						inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb', undefined, available));
					} else {
						inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb'));
					}
				}
			});

		} else if (inlineValuesSetting === 'on') { // fallback approach only when setting is 'on'
			if (!this.notebookEditor.hasModel()) {
				return; // should not happen, a cell will be executed
			}
			const kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
			const variables = kernel?.selected?.provideVariables(event.notebook, undefined, 'named', 0, token);
			if (!variables) {
				return;
			}

			const vars: VariablesResult[] = [];
			for await (const v of variables) {
				vars.push(v);
			}
			const varNames: string[] = vars.map(v => v.name);

			const document = cell.textModel;
			if (!document) {
				return;
			}

			// Skip processing for extremely large cells
			if (document.getLineCount() > NotebookInlineVariablesController.MAX_CELL_LINES) {
				return;
			}

			const inlineDecorations: IModelDeltaDecoration[] = [];
			const processedVars = new Set<string>();

			// Get both function ranges and comment ranges
			const functionRanges = this.getFunctionRanges(document);
			const commentedRanges = this.getCommentedRanges(document);
			const ignoredRanges = [...functionRanges, ...commentedRanges];
			const lineDecorations = new Map<number, InlineSegment[]>();

			// For each variable name found in the kernel results
			for (const varName of varNames) {
				if (processedVars.has(varName)) {
					continue;
				}

				// Look for variable usage globally - using word boundaries to ensure exact matches
				const regex = new RegExp(`\\b${varName}\\b(?!\\w)`, 'g');
				let lastMatchOutsideIgnored: { line: number; column: number } | null = null;
				let foundMatch = false;

				// Scan lines in reverse to find last occurrence first
				const lines = document.getValue().split('\n');
				for (let lineNumber = lines.length - 1; lineNumber >= 0; lineNumber--) {
					const line = lines[lineNumber];
					let match: RegExpExecArray | null;

					while ((match = regex.exec(line)) !== null) {
						const startIndex = match.index;
						const pos = new Position(lineNumber + 1, startIndex + 1);

						// Check if this position is in any ignored range (function or comment)
						if (!this.isPositionInRanges(pos, ignoredRanges)) {
							lastMatchOutsideIgnored = {
								line: lineNumber + 1,
								column: startIndex + 1
							};
							foundMatch = true;
							break; // Take first match in reverse order (which is last chronologically)
						}
					}

					if (foundMatch) {
						break; // We found our last valid occurrence, no need to check earlier lines
					}
				}

				if (lastMatchOutsideIgnored) {
					const inlineVal = varName + ' = ' + vars.find(v => v.name === varName)?.value;

					let lineSegments = lineDecorations.get(lastMatchOutsideIgnored.line);
					if (!lineSegments) {
						lineSegments = [];
						lineDecorations.set(lastMatchOutsideIgnored.line, lineSegments);
					}
					if (!lineSegments.some(iv => iv.text === inlineVal)) { // de-dupe
						lineSegments.push(new InlineSegment(lastMatchOutsideIgnored.column, inlineVal));
					}
				}

				processedVars.add(varName);
			}

			// sort line segments and concatenate them into a decoration
			lineDecorations.forEach((segments, line) => {
				if (segments.length > 0) {
					segments.sort((a, b) => a.column - b.column);
					const text = segments.map(s => s.text).join(', ');
					const editorWidth = cell.layoutInfo.editorWidth;
					const fontInfo = cell.layoutInfo.fontInfo;
					if (fontInfo && cell.textModel) {
						const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
						const lineLength = cell.textModel.getLineLength(line);
						const available = Math.max(0, base - lineLength);
						inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb', undefined, available));
					} else {
						inlineDecorations.push(...createInlineValueDecoration(line, text, 'nb'));
					}
				}
			});

			if (inlineDecorations.length > 0) {
				this.updateCellInlineDecorations(cell, inlineDecorations);
				this.initCellContentListener(cell);
			}
		}
	}

	private getFunctionRanges(document: ITextModel): Range[] {
		return document.getLanguageId() === 'python'
			? this.getPythonFunctionRanges(document.getValue())
			: this.getBracedFunctionRanges(document.getValue());
	}

	private getPythonFunctionRanges(code: string): Range[] {
		const functionRanges: Range[] = [];
		const lines = code.split('\n');
		let functionStartLine = -1;
		let inFunction = false;
		let pythonIndentLevel = -1;
		const pythonFunctionDeclRegex = /^(\s*)(async\s+)?(?:def\s+\w+|class\s+\w+)\s*\([^)]*\)\s*:/;

		for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
			const line = lines[lineNumber];

			// Check for Python function/class declarations
			const pythonMatch = line.match(pythonFunctionDeclRegex);
			if (pythonMatch) {
				if (inFunction) {
					// If we're already in a function and find another at the same or lower indent, close the current one
					const currentIndent = pythonMatch[1].length;
					if (currentIndent <= pythonIndentLevel) {
						functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
						inFunction = false;
					}
				}

				if (!inFunction) {
					inFunction = true;
					functionStartLine = lineNumber;
					pythonIndentLevel = pythonMatch[1].length;
				}
				continue;
			}

			// Check indentation for Python functions
			if (inFunction) {
				// Skip empty lines
				if (line.trim() === '') {
					continue;
				}

				// Get the indentation of the current line
				const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;

				// If we hit a line with same or lower indentation than where the function started,
				// we've exited the function
				if (currentIndent <= pythonIndentLevel) {
					functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
					inFunction = false;
					pythonIndentLevel = -1;
				}
			}
		}

		// Handle case where Python function is at the end of the document
		if (inFunction) {
			functionRanges.push(new Range(functionStartLine + 1, 1, lines.length, lines[lines.length - 1].length + 1));
		}

		return functionRanges;
	}

	private getBracedFunctionRanges(code: string): Range[] {
		const functionRanges: Range[] = [];
		const lines = code.split('\n');
		let braceDepth = 0;
		let functionStartLine = -1;
		let inFunction = false;
		const functionDeclRegex = /\b(?:function\s+\w+|(?:async\s+)?(?:\w+\s*=\s*)?\([^)]*\)\s*=>|class\s+\w+|(?:public|private|protected|static)?\s*\w+\s*\([^)]*\)\s*{)/;

		for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
			const line = lines[lineNumber];
			for (const char of line) {
				if (char === '{') {
					if (!inFunction && functionDeclRegex.test(line)) {
						inFunction = true;
						functionStartLine = lineNumber;
					}
					braceDepth++;
				} else if (char === '}') {
					braceDepth--;
					if (braceDepth === 0 && inFunction) {
						functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber + 1, line.length + 1));
						inFunction = false;
					}
				}
			}
		}

		return functionRanges;
	}

	private getCommentedRanges(document: ITextModel): Range[] {
		return this._getCommentedRanges(document);
	}

	private _getCommentedRanges(document: ITextModel): Range[] {
		try {
			return this.getCommentedRangesByAccurateTokenization(document);
		} catch (e) {
			// Fall back to manual parsing if tokenization fails
			return this.getCommentedRangesByManualParsing(document);
		}
	}

	private getCommentedRangesByAccurateTokenization(document: ITextModel): Range[] {
		const commentRanges: Range[] = [];
		const lineCount = document.getLineCount();

		// Skip processing for extremely large documents
		if (lineCount > NotebookInlineVariablesController.MAX_CELL_LINES) {
			return commentRanges;
		}

		// Process each line - force tokenization if needed and process tokens in a single pass
		for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			// Force tokenization if needed
			if (!document.tokenization.hasAccurateTokensForLine(lineNumber)) {
				document.tokenization.forceTokenization(lineNumber);
			}

			const lineTokens = document.tokenization.getLineTokens(lineNumber);

			// Skip lines with no tokens
			if (lineTokens.getCount() === 0) {
				continue;
			}

			let startCharacter: number | undefined;

			// Check each token in the line
			for (let tokenIndex = 0; tokenIndex < lineTokens.getCount(); tokenIndex++) {
				const tokenType = lineTokens.getStandardTokenType(tokenIndex);

				if (tokenType === StandardTokenType.Comment || tokenType === StandardTokenType.String || tokenType === StandardTokenType.RegEx) {
					if (startCharacter === undefined) {
						// Start of a comment or string
						startCharacter = lineTokens.getStartOffset(tokenIndex);
					}

					const endCharacter = lineTokens.getEndOffset(tokenIndex);

					// Check if this is the end of the comment/string section (either end of line or different token type follows)
					const isLastToken = tokenIndex === lineTokens.getCount() - 1;
					const nextTokenDifferent = !isLastToken &&
						lineTokens.getStandardTokenType(tokenIndex + 1) !== tokenType;

					if (isLastToken || nextTokenDifferent) {
						// End of comment/string section
						commentRanges.push(new Range(lineNumber, startCharacter + 1, lineNumber, endCharacter + 1));
						startCharacter = undefined;
					}
				} else {
					// Reset when we hit a non-comment, non-string token
					startCharacter = undefined;
				}
			}
		}

		return commentRanges;
	}

	private getCommentedRangesByManualParsing(document: ITextModel): Range[] {
		const commentRanges: Range[] = [];
		const lines = document.getValue().split('\n');
		const languageId = document.getLanguageId();

		// Different comment patterns by language
		const lineCommentToken =
			languageId === 'python' ? '#' :
				languageId === 'javascript' || languageId === 'typescript' ? '//' :
					null;

		const blockComments =
			(languageId === 'javascript' || languageId === 'typescript') ? { start: '/*', end: '*/' } :
				null;

		let inBlockComment = false;
		let blockCommentStartLine = -1;
		let blockCommentStartCol = -1;

		for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
			const line = lines[lineNumber];
			const trimmedLine = line.trim();

			// Skip empty lines
			if (trimmedLine.length === 0) {
				continue;
			}

			if (blockComments) {
				if (!inBlockComment) {
					const startIndex = line.indexOf(blockComments.start);
					if (startIndex !== -1) {
						inBlockComment = true;
						blockCommentStartLine = lineNumber;
						blockCommentStartCol = startIndex;
					}
				}

				if (inBlockComment) {
					const endIndex = line.indexOf(blockComments.end);
					if (endIndex !== -1) {
						commentRanges.push(new Range(
							blockCommentStartLine + 1,
							blockCommentStartCol + 1,
							lineNumber + 1,
							endIndex + blockComments.end.length + 1
						));
						inBlockComment = false;
					}
					continue;
				}
			}

			if (!inBlockComment && lineCommentToken && line.trimLeft().startsWith(lineCommentToken)) {
				const startCol = line.indexOf(lineCommentToken);
				commentRanges.push(new Range(
					lineNumber + 1,
					startCol + 1,
					lineNumber + 1,
					line.length + 1
				));
			}
		}

		// Handle block comment at end of file
		if (inBlockComment) {
			commentRanges.push(new Range(
				blockCommentStartLine + 1,
				blockCommentStartCol + 1,
				lines.length,
				lines[lines.length - 1].length + 1
			));
		}

		return commentRanges;
	}

	private isPositionInRanges(position: Position, ranges: Range[]): boolean {
		return ranges.some(range => range.containsPosition(position));
	}

	private updateCellInlineDecorations(cell: ICellViewModel, decorations: IModelDeltaDecoration[]) {
		const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
		this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
			oldDecorations,
			decorations
		));
	}

	private initCellContentListener(cell: ICellViewModel) {
		const cellModel = cell.textModel;
		if (!cellModel) {
			return; // should not happen
		}

		// Clear decorations on content change
		this.cellContentListeners.set(cell.uri, cellModel.onDidChangeContent(() => {
			this.clearCellInlineDecorations(cell);
		}));
	}

	private clearCellInlineDecorations(cell: ICellViewModel) {
		const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
		if (cellDecorations) {
			cell.deltaModelDecorations(cellDecorations, []);
			this.cellDecorationIds.delete(cell);
		}

		const listener = this.cellContentListeners.get(cell.uri);
		if (listener) {
			listener.dispose();
			this.cellContentListeners.delete(cell.uri);
		}
	}

	private _clearNotebookInlineDecorations() {
		this.cellDecorationIds.forEach((_, cell) => {
			this.clearCellInlineDecorations(cell);
		});
	}

	public clearNotebookInlineDecorations() {
		this._clearNotebookInlineDecorations();
	}

	override dispose(): void {
		super.dispose();
		this._clearNotebookInlineDecorations();
		this.currentCancellationTokenSources.forEach(source => source.cancel());
		this.currentCancellationTokenSources.clear();
		this.cellContentListeners.forEach(listener => listener.dispose());
		this.cellContentListeners.clear();
	}
}

registerNotebookContribution(NotebookInlineVariablesController.id, NotebookInlineVariablesController);

registerAction2(class ClearNotebookInlineValues extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.clearAllInlineValues',
			title: localize('clearAllInlineValues', 'Clear All Inline Values'),
		});
	}

	override runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const controller = editor.getContribution<NotebookInlineVariablesController>(NotebookInlineVariablesController.id);
		controller.clearNotebookInlineDecorations();
		return Promise.resolve();
	}

});
