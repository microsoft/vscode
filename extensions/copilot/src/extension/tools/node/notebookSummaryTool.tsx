/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { getCellId } from '../../../platform/notebook/common/helpers';
import { INotebookSummaryTracker } from '../../../platform/notebook/common/notebookSummaryTracker';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { findNotebook } from '../../../util/common/notebooks';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult, MarkdownString, NotebookCellKind, Position } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { NotebookVariables } from '../../prompts/node/panel/notebookVariables';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { AlternativeNotebookDocument } from '../../../platform/notebook/common/alternativeNotebookDocument';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { ILogService } from '../../../platform/log/common/logService';


export interface INotebookSummaryToolParams {
	filePath: string;
}

export class NotebookSummaryTool implements ICopilotTool<INotebookSummaryToolParams> {
	public static toolName = ToolName.GetNotebookSummary;
	private promptContext?: IBuildPromptContext;

	constructor(
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkspaceService protected readonly workspaceService: IWorkspaceService,
		@IAlternativeNotebookContentService protected readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@INotebookSummaryTracker protected readonly notebookStructureTracker: INotebookSummaryTracker,
		@INotebookService private readonly notebookService: INotebookService,
		@ILogService private readonly logger: ILogService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<INotebookSummaryToolParams>, token: vscode.CancellationToken) {
		this.logger.trace(`Invoking Notebook Summary Tool for file ${options.input.filePath}`);
		let uri = this.promptPathRepresentationService.resolveFilePath(options.input.filePath);
		if (!uri) {
			throw new Error(`Invalid file path`);
		}
		// Sometimes we get the notebook cell Uri in the resource.
		// Resolve this to notebook.
		let notebook = findNotebook(uri, this.workspaceService.notebookDocuments);
		if (notebook) {
			uri = notebook.uri;
		} else if (!this.notebookService.hasSupportedNotebooks(uri)) {
			throw new Error(`Use this tool only with Notebook files, the file ${uri.toString()} is not a notebook.`);
		}
		try {
			notebook = notebook || await this.workspaceService.openNotebookDocument(uri);
		} catch (ex) {
			this.logger.error(`Failed to open notebook: ${uri.toString()}`, ex);
			throw new Error(`Failed to open the notebook ${uri.toString()}, ${ex.message || ''}. Verify the file exists.`);
		}

		if (token.isCancellationRequested) {
			return;
		}

		this.notebookStructureTracker.trackNotebook(notebook);
		this.notebookStructureTracker.clearState(notebook);
		const format = this.alternativeNotebookContent.getFormat(this.promptContext?.request?.model);
		const altDoc = this.alternativeNotebookContent.create(format).getAlternativeDocument(notebook);
		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(
					this.instantiationService,
					NotebookSummary,
					{ notebook, altDoc, includeCellLines: true },
					// If we are not called with tokenization options, have _some_ fake tokenizer
					// otherwise we end up returning the entire document
					options.tokenizationOptions ?? {
						tokenBudget: 1000,
						countTokens: (t) => Promise.resolve(t.length * 3 / 4)
					},
					token,
				),
			)
		]);
	}

	async resolveInput(input: INotebookSummaryToolParams, promptContext: IBuildPromptContext): Promise<INotebookSummaryToolParams> {
		this.promptContext = promptContext;
		return input;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<INotebookSummaryToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: new MarkdownString(l10n.t`Retrieving Notebook summary.`)
		};
	}

}

ToolRegistry.registerTool(NotebookSummaryTool);


type NotebookStatePromptProps = PromptElementProps<{
	notebook: vscode.NotebookDocument;
	altDoc: AlternativeNotebookDocument | undefined;
	includeCellLines: boolean;
}>;

export class NotebookSummary extends PromptElement<NotebookStatePromptProps> {
	constructor(
		props: NotebookStatePromptProps,
		@IAlternativeNotebookContentService protected readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@ILogService private readonly logger: ILogService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		try {
			return (
				<>
					{this.getSummary()}
					<br />
					<NotebookVariables notebook={this.props.notebook} />
				</>
			);
		}
		catch (ex) {
			this.logger.error(`Error rendering NotebookSummary prompt element for notebook ${this.props.notebook.uri.toString()}`, ex);
			throw ex;
		}
	}

	private getSummary() {
		this.logger.trace(`Generating notebook summary for ${this.props.notebook.uri.toString()}`);
		const hasAnyCellBeenExecuted = this.props.notebook.getCells().some(cell => cell.executionSummary?.executionOrder !== undefined && cell.executionSummary?.timing);
		const altDoc = this.props.altDoc;
		const includeCellLines = this.props.includeCellLines && !!altDoc;
		return (
			<>
				Below is a summary of the notebook {this.promptPathRepresentationService.getFilePath(this.props.notebook.uri)}:<br />
				{hasAnyCellBeenExecuted ? 'The execution count can be used to determine the order in which the cells were executed' : 'None of the cells have been executed'}.<br />
				{this.props.notebook.cellCount === 0 ? 'This notebook does not have any cells.' : ''}<br />
				{this.props.notebook.getCells().map((cell, i) => {
					const cellNumber = i + 1;
					const language = cell.kind === NotebookCellKind.Code ? `, Language = ${cell.document.languageId}` : '';
					const cellType = cell.kind === NotebookCellKind.Code ? 'Code' : 'Markdown';
					const executionOrder = cell.executionSummary?.executionOrder;
					const cellId = getCellId(cell);
					let executionSummary = '';

					const altCellStartLine = includeCellLines ? altDoc.fromCellPosition(cell, new Position(0, 0)).line + 1 : -1;
					const altCellEndLine = includeCellLines ? altDoc.fromCellPosition(cell, new Position(cell.document.lineCount - 1, 0)).line + 1 : -1;
					const cellLines = `From ${altCellStartLine} to ${altCellEndLine}`;
					// If there's no timing, then means the notebook wasn't executed in current session.
					// Timing information is generally not stored in notebooks.
					if (executionOrder === undefined || !cell.executionSummary?.timing) {
						executionSummary = `Execution = Cell not executed.`;
					} else {
						const state = typeof cell.executionSummary?.success === 'undefined' ? 'and' : (cell.executionSummary.success ? 'successfully and' : 'with errors and');
						executionSummary = `Execution = Cell executed ${state} execution Count = ${executionOrder}`;
					}
					if (cell.kind === NotebookCellKind.Markup) {
						executionSummary = 'This is a markdown cell, and cannot be executed.';
					}
					const indent = '    ';
					const mimeTypes = new Set<string>();
					cell.outputs.forEach(output => output.items.forEach(item => mimeTypes.add(item.mime)));
					const outputs = (cell.kind !== NotebookCellKind.Markup && cell.outputs.length > 0) ? <>{indent}Cell has outputs with mime types = {Array.from(mimeTypes).join(', ')}<br /></> : <></>;
					return (
						<>{cellNumber}. Cell Id = {cellId}<br />
							{indent}Cell Type = {cellType}{language}<br />
							{includeCellLines && <>{indent}Cell Lines = {cellLines}<br /></>}
							{indent}{executionSummary}<br />
							{outputs}
						</>
					);
				})}
			</>
		);
	}
}