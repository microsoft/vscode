/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { format, noBreakWhitespace } from '../../../../../../base/common/strings.js';
import { Constants } from '../../../../../../base/common/uint.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { InlineValueContext, InlineValueText, InlineValueVariableLookup } from '../../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, InjectedTextCursorStops } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IDebugService, State } from '../../../../debug/common/debug.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { ICellExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { INotebookKernelMatchResult, INotebookKernelService, VariablesResult } from '../../../common/notebookKernelService.js';
import { INotebookActionContext, NotebookAction } from '../../controller/coreActions.js';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';

// value from debug, may need to keep an eye on and shorter to account for cells having a narrower viewport width
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator. If exceeded ... is added

const variableRegex = new RegExp(
	'(?:[a-zA-Z_][a-zA-Z0-9_]*\\.)*' + //match any number of variable names separated by '.'
	'[a-zA-Z_][a-zA-Z0-9_]*', //math variable name
	'g',
);

class InlineSegment {
	constructor(public column: number, public text: string) {
	}
}

export class NotebookInlineVariablesController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.inlineVariablesController';

	private cellDecorationIds = new Map<ICellViewModel, string[]>();
	private cellContentListeners = new ResourceMap<IDisposable>();

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
			if (!this.configurationService.getValue<boolean>(NotebookSetting.notebookInlineValues)) {
				return;
			}

			if (e.type === NotebookExecutionType.cell) {
				await this.updateInlineVariables(e);
			}
		}));
	}

	private async updateInlineVariables(event: ICellExecutionStateChangedEvent): Promise<void> {
		if (this.debugService.state !== State.Inactive) {
			this._clearNotebookInlineDecorations();
			return;
		}

		if (this.notebookEditor.textModel?.uri && isEqual(this.notebookEditor.textModel.uri, event.notebook)) {
			return;
		}

		if (event.changed) { // undefined -> execution was completed, so return on all else
			return;
		}

		const cell = this.notebookEditor.getCellByHandle(event.cellHandle);
		if (!cell) {
			return;
		}
		const model = await cell.resolveTextModel();
		if (!model) {
			return;
		}

		this.clearCellInlineDecorations(cell);

		const cts = new CancellationTokenSource();
		const inlineDecorations: IModelDeltaDecoration[] = [];

		if (this.languageFeaturesService.inlineValuesProvider.has(model)) {
			// use extension based provider, borrowed from https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L679
			const lastLine = model.getLineCount();
			const lastColumn = model.getLineMaxColumn(lastLine);
			const ctx: InlineValueContext = {
				frameId: 0, // ignored, we won't have a stack from since not in a debug session
				stoppedLocation: new Range(lastLine + 1, 0, lastLine + 1, 0) // executing cell by cell, so "stopped" location would just be the end of document
			};

			const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
			const lineDecorations = new Map<number, InlineSegment[]>();

			const fullCellRange = new Range(1, 1, lastLine, lastColumn);

			const promises = providers.flatMap(provider => Promise.resolve(provider.provideInlineValues(model, fullCellRange, ctx, cts.token)).then(async (result) => {
				if (result) {

					let kernel: INotebookKernelMatchResult;
					const kernelVars: VariablesResult[] = [];
					if (result.some(iv => iv.type === 'variable')) { // if anyone will need a lookup, get vars now to avoid needing to do it multiple times
						if (!this.notebookEditor.hasModel()) {
							return; // should not happen, a cell will be executed
						}
						kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
						const variables = kernel.selected?.provideVariables(event.notebook, undefined, 'named', 0, cts.token);
						if (!variables) {
							return;
						}
						for await (const v of variables) {
							kernelVars.push(v);
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
				}
			}, err => {
				onUnexpectedExternalError(err);
			}));

			await Promise.all(promises);

			// sort line segments and concatenate them into a decoration
			lineDecorations.forEach((segments, line) => {
				if (segments.length > 0) {
					segments = segments.sort((a, b) => a.column - b.column);
					const text = segments.map(s => s.text).join(', ');
					inlineDecorations.push(...this.createNotebookInlineValueDecoration(line, text));

				}
			});

		} else { // generic regex matching approach
			if (!this.notebookEditor.hasModel()) {
				return; // should not happen, a cell will be executed
			}
			const kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
			const variables = kernel?.selected?.provideVariables(event.notebook, undefined, 'named', 0, CancellationToken.None);
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

			for (let i = 1; i <= document.getLineCount(); i++) {
				const line = document.getLineContent(i);

				if (line.trimStart().startsWith('#')) {
					continue;
				}
				for (let match = variableRegex.exec(line); match; match = variableRegex.exec(line)) {
					const name = match[0];
					if (varNames.includes(name)) {
						const inlineVal = name + ' = ' + vars.find(v => v.name === name)?.value;
						inlineDecorations.push(...this.createNotebookInlineValueDecoration(i, inlineVal));
					}
				}
			}
		}

		if (inlineDecorations.length > 0) {
			this.updateCellInlineDecorations(cell, inlineDecorations);
			this.initCellContentListener(cell);
		}
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

	// taken from /src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts
	private createNotebookInlineValueDecoration(lineNumber: number, contentText: string, column = Constants.MAX_SAFE_SMALL_INTEGER): IModelDeltaDecoration[] {
		// If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
		if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
			contentText = contentText.substring(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
		}

		return [
			{
				range: {
					startLineNumber: lineNumber,
					endLineNumber: lineNumber,
					startColumn: column,
					endColumn: column
				},
				options: {
					description: 'nb-inline-value-decoration-spacer',
					after: {
						content: noBreakWhitespace,
						cursorStops: InjectedTextCursorStops.None
					},
					showIfCollapsed: true,
				}
			},
			{
				range: {
					startLineNumber: lineNumber,
					endLineNumber: lineNumber,
					startColumn: column,
					endColumn: column
				},
				options: {
					description: 'nb-inline-value-decoration',
					after: {
						content: this.replaceWsWithNoBreakWs(contentText),
						inlineClassName: 'nb-inline-value',
						inlineClassNameAffectsLetterSpacing: true,
						cursorStops: InjectedTextCursorStops.None
					},
					showIfCollapsed: true,
				}
			},
		];
	}

	private replaceWsWithNoBreakWs(str: string): string {
		return str.replace(/[ \t]/g, noBreakWhitespace);
	}

	override dispose(): void {
		super.dispose();
		this._clearNotebookInlineDecorations();
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
