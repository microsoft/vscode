/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { getCellIdMap, parseAndCleanStack } from '../../../platform/notebook/common/helpers';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createSha256Hash } from '../../../util/common/crypto';
import { findNotebook, isJupyterNotebookUri } from '../../../util/common/notebooks';
import { raceCancellationError, raceTimeout } from '../../../util/vs/base/common/async';
import { dispose } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelDataPart, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { getCharLimit } from '../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { IInstallExtensionToolInput } from './installExtensionTool';
import { ChatImageMimeType } from '../../conversation/common/languageModelChatMessageHelpers';

class RunNotebookTelemetryEvent {
	public result: 'success' | 'failure' | 'skipped' = 'failure';
	public resultInfo: string | undefined;
	constructor(
		private readonly filepath: string,
		private readonly requestId?: string,
		private readonly model?: string,
	) { }

	public skipped(reason: string) {
		this.result = 'skipped';
		this.resultInfo = reason;
	}

	public failed(reason: string) {
		this.result = 'failure';
		this.resultInfo = reason;
	}

	public async send(telemetryService: ITelemetryService) {
		const resourceHash = await createSha256Hash(this.filepath);

		/* __GDPR__
			"runNotebookCellInvoked" : {
				"owner": "amunger",
				"comment": "Tracks the usage and result ",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"resourceHash": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The hash of the resource of the current request turn. (Notebook Uri)" },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used for the request." },
				"result": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Result of the operation: success, failure, or unknown." },
				"resultInfo": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reason for failure if the result is failure." }
			}
		*/
		telemetryService.sendMSFTTelemetryEvent('runNotebookCellInvoked',
			{
				requestId: this.requestId,
				resourceHash,
				model: this.model,
				result: this.result,
				resultInfo: this.resultInfo,
			},
		);
	}
}

export class RunNotebookCellTool implements ICopilotTool<IRunNotebookCellToolParams> {
	public static toolName = ToolName.RunNotebookCell;
	private _promptContext: IBuildPromptContext | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@INotebookService private readonly notebookService: INotebookService,
		@IAlternativeNotebookContentService protected readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IToolsService private readonly toolsService: IToolsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IRunNotebookCellToolParams>, token: vscode.CancellationToken) {
		const { filePath, cellId, continueOnError } = options.input;

		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;
		const telemetryEvent = new RunNotebookTelemetryEvent(filePath, options.chatRequestId, model);

		try {
			const { notebook, cell } = this.getNotebookAndCell(filePath, cellId);

			// track that a notebook tool was invoked by the agent, exposes follow execution action to toolbar
			this.notebookService.trackAgentUsage();

			// If this is a Jupyter notebook with Python code and Jupyter extension isn't installed, recommend installing it
			const JUPYTER_EXTENSION_ID = 'ms-toolsai.jupyter';
			if (isJupyterNotebookUri(notebook.uri) && notebook.getCells().some(c => c.document.languageId.toLowerCase() === 'python') && !this.extensionsService.getExtension(JUPYTER_EXTENSION_ID)) {
				try {
					const input: IInstallExtensionToolInput = {
						id: JUPYTER_EXTENSION_ID,
						name: 'Jupyter'
					};
					await this.toolsService.invokeTool(ToolName.InstallExtension, { ...options, input }, token);
				} catch {
					//
				}
			}

			await this.notebookService.ensureKernelSelected(notebook.uri);
			if (token.isCancellationRequested) {
				telemetryEvent.skipped('canceled');
				return new LanguageModelToolResult([]);
			}

			const index = notebook.getCells().findIndex((c) => c === cell);

			if (cell.kind !== 2) {
				telemetryEvent.skipped('markdownCell');
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Cell ${cellId} is not a code cell so it can't be executed. If this is unexpected, then use the ${ToolName.ReadFile} file tool to get the latest content of the notebook file`)
				]);
			} else if (cell.document.getText().trim() === '') {
				telemetryEvent.skipped('emptyCell');
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Cell ${cellId} is empty, so it won't be executed. If this is unexpected, then use the ${ToolName.ReadFile} file tool to get the latest content of the notebook file`)
				]);
			}

			let infoMessage: string | undefined = undefined;
			let executionSummary: vscode.NotebookCellExecutionSummary | undefined = undefined;
			const disposables: vscode.Disposable[] = [];
			try {
				const cellExecution = raceCancellationError(this.waitForCellExecution(cell, disposables), token);
				const autoRevealArg = this.notebookService.getFollowState();

				await this.notebookService.runCells(notebook.uri, { start: index, end: index + 1 }, autoRevealArg);

				executionSummary = await raceTimeout(cellExecution, 3_000);
				if (executionSummary) {
					if (executionSummary.success === false) {
						telemetryEvent.failed('ExecutionFailed');
						if (!continueOnError) {
							infoMessage = `Cell ${cellId} execution failed. The error should be fixed before running any more cells.`;
						}
					} else {
						telemetryEvent.result = 'success';
					}
				} else {
					// some controllers will return before finishing execution,
					// But we can't tell the difference between a cell that is still executing and one that just failed to execute
					infoMessage = `Cell ${cellId} did not finish executing. It may still be running, or it may have failed to execute.`;
					telemetryEvent.failed('ExecutionTimeout');
				}
			} finally {
				dispose(disposables);
			}

			const outputs = cell?.outputs || [];
			const toolCallResults: Array<LanguageModelPromptTsxPart | unknown> = [];

			// execution summary
			toolCallResults.push(new LanguageModelPromptTsxPart(await renderPromptElementJSON(this.instantiationService, RunNotebookCellResultSummary, { executionSummary, infoMessage }, options.tokenizationOptions, token)));

			const endpoint = this._promptContext?.request ? await this.endpointProvider.getChatEndpoint(this._promptContext?.request) : undefined;

			for (let i = 0; i < outputs.length; i++) {
				const output = outputs[i];
				const imageItem = endpoint?.supportsVision ? output.items.find((item) => item.mime === 'image/png' || item.mime === 'image/jpeg') : undefined;

				if (imageItem) {
					toolCallResults.push(new LanguageModelTextPart(`<cell-output>\nOutput ${i}:\n`));
					toolCallResults.push(LanguageModelDataPart.image(imageItem.data, imageItem.mime === 'image/png' ? ChatImageMimeType.PNG : ChatImageMimeType.JPEG));
					toolCallResults.push(new LanguageModelTextPart(`</cell-output>`));
				} else {
					toolCallResults.push(new LanguageModelPromptTsxPart(await renderPromptElementJSON(this.instantiationService, RunNotebookCellOutput, { output, index: i, sizeLimitRatio: 4 }, options.tokenizationOptions, token)));
				}
			}

			const result = new ExtendedLanguageModelToolResult(toolCallResults as any[]);

			const cellUri = cell?.document.uri;
			result.toolResultMessage = new MarkdownString(`Ran [](${cellUri?.toString()})`);

			return result;
		} catch (error) {
			telemetryEvent.failed(error.message || 'exceptionThrown');
		} finally {
			await telemetryEvent.send(this.telemetryService);
		}
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IRunNotebookCellToolParams>): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { filePath, cellId, reason } = options.input;

		const { cell } = this.getNotebookAndCell(filePath, cellId);

		// track that a notebook tool was invoked by the agent, exposes follow execution action to toolbar
		this.notebookService.trackAgentUsage();

		const cellContent = this.formatRunMessage(cell, reason);
		const confirmationMessages = {
			title: l10n.t`Run Notebook Cell`,
			message: cellContent,
		};

		return {
			confirmationMessages,
			invocationMessage: new MarkdownString(l10n.t`Running [](${cell.document.uri.toString()})`),
		};
	}

	async resolveInput(input: IRunNotebookCellToolParams, promptContext: IBuildPromptContext): Promise<IRunNotebookCellToolParams> {
		this._promptContext = promptContext;
		return input;
	}

	private getNotebookAndCell(filePath: string, cellId: string): { notebook: vscode.NotebookDocument; cell: vscode.NotebookCell } {
		const resolvedUri = this.promptPathRepresentationService.resolveFilePath(filePath);
		if (!resolvedUri) {
			throw new Error(`Invalid file path`);
		}
		const notebook = findNotebook(resolvedUri, this.workspaceService.notebookDocuments);
		if (!notebook) {
			throw new Error(`Notebook ${resolvedUri} not found.`);
		}

		const cell = getCellIdMap(notebook).get(cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found in the notebook, use the ${ToolName.ReadFile} file tool to get the latest content of the notebook file`);
		}

		return { notebook, cell };
	}

	private formatRunMessage(cell: vscode.NotebookCell, reason?: string) {
		const lines = [`[](${cell.document.uri.toString()})`, ''];
		lines.push('```' + cell.document.languageId);

		let emptyLine = true;
		// remove leading and consecutive empty lines
		for (const line of cell.document.getText().split('\n')) {

			if (lines.length > 10) {
				lines.push('...');
				break;
			}

			if (line.trim() === '') {
				if (emptyLine) {
					continue;
				}
				emptyLine = true;
			} else {
				emptyLine = false;
			}
			lines.push(line);
		}

		if (reason) {
			lines.unshift('');
			lines.unshift(reason);
		}

		const message = lines.join('\n').trim() + '\n```';
		return new MarkdownString(message);
	}

	private async waitForCellExecution(cell: vscode.NotebookCell, disposables: vscode.Disposable[]) {
		return new Promise<vscode.NotebookCellExecutionSummary>((resolve) => {
			disposables.push(this.workspaceService.onDidChangeNotebookDocument((e) => {
				for (const change of e.cellChanges) {
					if (change.executionSummary && typeof change.executionSummary.success === 'boolean' && change.cell === cell) {
						resolve(change.executionSummary);
					}
				}
			}));
		});
	}
}

interface IRunNotebookCellToolParams {
	filePath: string;
	cellId: string;
	reason?: string;
	continueOnError?: boolean;
}

interface IRunNotebookCellResultSummaryProps extends BasePromptElementProps {
	executionSummary: vscode.NotebookCellExecutionSummary | undefined;
	infoMessage: string | undefined;
}


class RunNotebookCellResultSummary extends PromptElement<IRunNotebookCellResultSummaryProps> {
	override render(state: void, sizing: PromptSizing) {
		const { executionSummary } = this.props;
		return (
			<>
				<Tag name={`execution-summaries`}>
					{executionSummary && this.renderSummary('cellId', executionSummary, true)}
				</Tag>
				{this.renderAdditionalInfo()}
			</>
		);
	}

	private renderAdditionalInfo() {
		if (!this.props.infoMessage) {
			return <></>;
		}
		return (
			<Tag name='additional-info'>
				{this.renderInfoMessage(this.props.infoMessage)}
			</Tag>
		);
	}

	private renderSummary(cellId: string, execution: vscode.NotebookCellExecutionSummary, renderExecutionOrder: boolean) {
		let result = <>cell {cellId} </>;
		if (typeof execution?.success === 'boolean') {
			result = <>{result}{execution?.success ? <>executed successfully <br /></> : <>execution failed <br /></>}</>;
		} else {
			result = <>{result}<br /></>;
		}
		if (execution?.timing) {
			result = <>{result}Total Duration: {execution.timing.endTime - execution.timing.startTime}ms <br /></>;
		}
		if (renderExecutionOrder && execution?.executionOrder) {
			result = <>{result}Last Execution Order: {execution.executionOrder} </>;
		}
		return result;
	}

	private renderInfoMessage(infoMessage: string) {
		return (
			<>{infoMessage} <br /> </>
		);
	}
}

interface IRunNotebookCellOutputProps extends BasePromptElementProps {
	output: vscode.NotebookCellOutput;
	index: number;
	sizeLimitRatio: number;
}

export class RunNotebookCellOutput extends PromptElement<IRunNotebookCellOutputProps> {

	override render(state: void, sizing: PromptSizing) {
		const { output, index } = this.props;
		const error = output.items.find((item) => item.mime === 'application/vnd.code.notebook.error');
		if (error) {
			const errorMessage = error.data.toString();
			const isMissingPackageError = errorMessage.includes('ModuleNotFoundError');

			return <Tag name='cell-execution-error'>
				Error: {parseAndCleanStack(errorMessage)}<br />
				{isMissingPackageError ?
					`Either use notebook_install_packages_tool to install the missing package if the tool exists, or add/edit a cell with '%pip install' to install the package.` :
					'Make sure to check the contents of previous cells to see if rerunning those cells would resolve the issue.'}
			</Tag>;
		}



		const textItem = output.items.find((item) =>
			item.mime === 'text/html'
			|| item.mime === 'text/markdown'
			|| item.mime === 'text/plain'
			|| item.mime === 'application/vnd.code.notebook.stdout'
			|| item.mime === 'application/vnd.code.notebook.stderr'
			|| item.mime === 'application/json');
		if (textItem) {
			if (getCharLimit(textItem.data.byteLength) > sizing.tokenBudget / this.props.sizeLimitRatio) {
				return <Tag name={`cell-output`} attrs={{ mimeType: textItem.mime }}>
					Output {index + 1}: Output is too large to be used as context in the language model, but the user should be able to see it in the notebook.<br />
					<br />
				</Tag>;
			}
			return <Tag name={`cell-output`} attrs={{ mimeType: textItem.mime }}>
				Output {index + 1}: {textItem.data.toString()}
			</Tag>;
		}

		const largeOutput = output.items.find((item) => getCharLimit(item.data.byteLength) > sizing.tokenBudget / this.props.sizeLimitRatio);
		if (largeOutput) {
			return <Tag name={`cell-output`} attrs={{ mimeType: largeOutput.mime }}>
				Output {index + 1}: Output is too large to be used as context in the language model, but the user should be able to see it in the notebook.<br />
				<br />
			</Tag>;
		}

		return <Tag name='cell-output'>
			Output with mimeTypes: {output.items.map((item) => item.mime).join(', ')}<br />
			{`Output ${index}: ${this.renderOutputFallback(output, sizing.tokenBudget / 8)}`}
		</Tag>;
	}

	private renderOutputFallback(output: vscode.NotebookCellOutput, limit: number) {
		const items = output.items.map(item => {
			const buffer = item.data;
			const text = buffer.toString();
			return text;
		});
		const itemsText = items.join('\n');

		const textChunk = itemsText.length > limit ? itemsText.substring(0, limit) : itemsText;
		return textChunk;
	}
}

ToolRegistry.registerTool(RunNotebookCellTool);
