/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { IAlternativeNotebookContentEditGenerator, NotebookEditGenrationSource } from '../../../platform/notebook/common/alternativeContentEditGenerator';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { getLanguageForResource } from '../../../util/common/languages';
import { removeLeadingFilepathComment } from '../../../util/common/markdown';
import { extname } from '../../../util/vs/base/common/resources';
import { count } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Position as ExtPosition, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString, TextEdit } from '../../../vscodeTypes';
import { CodeBlockProcessor } from '../../codeBlocks/node/codeBlockProcessor';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { processFullRewriteNewNotebook } from '../../prompts/node/codeMapper/codeMapper';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { formatUriForFileWidget } from '../common/toolUtils';
import { ActionType } from './applyPatch/parser';
import { EditFileResult } from './editFileToolResult';
import { createEditConfirmation, formatDiffAsUnified } from './editFileToolUtils';
import { resolveToolInputPath } from './toolUtils';

export interface ICreateFileParams {
	filePath: string;
	content?: string;
}


export class CreateFileTool implements ICopilotTool<ICreateFileParams> {
	public static toolName = ToolName.CreateFile;
	public static readonly nonDeferred = true;

	private _promptContext: IBuildPromptContext | undefined;

	constructor(
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkspaceService protected readonly workspaceService: IWorkspaceService,
		@IToolsService protected readonly toolsService: IToolsService,
		@INotebookService protected readonly notebookService: INotebookService,
		@IAlternativeNotebookContentService protected readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IAlternativeNotebookContentEditGenerator protected readonly alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator,
		@IFileSystemService protected readonly fileSystemService: IFileSystemService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IEndpointProvider protected readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ICreateFileParams>, token: vscode.CancellationToken) {
		const uri = this.promptPathRepresentationService.resolveFilePath(options.input.filePath);
		if (!uri) {
			throw new Error(`Invalid file path`);
		}

		if (!this._promptContext?.stream) {
			throw new Error('Invalid stream');
		}

		// Validate parameters
		if (!options.input.filePath || options.input.content === undefined) {
			throw new Error('Invalid input: filePath and content are required');
		}

		const fileExists = await this.fileExists(uri);
		const hasSupportedNotebooks = this.notebookService.hasSupportedNotebooks(uri);
		let doc: undefined | NotebookDocumentSnapshot | TextDocumentSnapshot = undefined;
		try {
			if (hasSupportedNotebooks) {
				doc = await this.workspaceService.openNotebookDocumentAndSnapshot(uri, this.alternativeNotebookContent.getFormat(this._promptContext?.request?.model));
			} else {
				doc = await this.workspaceService.openTextDocumentAndSnapshot(uri);
			}
		} catch (e) {
			// ignored
		}

		// note: fileExists could be `false` but we might still get a `doc` if it's held in memory
		if (fileExists && !!doc?.getText()) {
			if (hasSupportedNotebooks) {
				throw new Error(`File already exists. You must use the ${ToolName.EditNotebook} tool to modify it.`);
			} else {
				throw new Error(`File already exists. You must use an edit tool to modify it.`);
			}
		}

		const languageId = doc?.languageId ?? getLanguageForResource(uri).languageId;
		const fileExtension = extname(uri);
		const modelId = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;

		if (hasSupportedNotebooks) {
			// Its possible we have a code block with a language id
			// Also possible we have file paths in the content.
			let content = options.input.content;
			const processor = new CodeBlockProcessor(() => undefined, () => undefined, (codeBlock) => content = codeBlock.code);
			processor.processMarkdown(options.input.content);
			processor.flush();
			content = removeLeadingFilepathComment(options.input.content, languageId, options.input.filePath);
			await processFullRewriteNewNotebook(uri, content, this._promptContext.stream, this.alternativeNotebookEditGenerator, { source: NotebookEditGenrationSource.createFile, requestId: options.chatRequestId, model: options.model ? this.endpointProvider.getChatEndpoint(options.model).then(m => m.model) : undefined }, token);
			this._promptContext.stream.notebookEdit(uri, true);
			this.sendTelemetry(options.chatRequestId, modelId, fileExtension);
		} else {
			const content = removeLeadingFilepathComment(options.input.content, languageId, options.input.filePath);
			this._promptContext.stream.textEdit(uri, TextEdit.insert(new ExtPosition(0, 0), content));
			this._promptContext.stream.textEdit(uri, true);
			this.sendTelemetry(options.chatRequestId, modelId, fileExtension);
			return new LanguageModelToolResult([
				new LanguageModelPromptTsxPart(
					await renderPromptElementJSON(
						this.instantiationService,
						EditFileResult,
						{ files: [{ operation: ActionType.ADD, uri, isNotebook: false }], diagnosticsTimeout: 2000, toolName: ToolName.CreateFile, requestId: options.chatRequestId, model: options.model },
						options.tokenizationOptions ?? {
							tokenBudget: 1000,
							countTokens: (t) => Promise.resolve(t.length * 3 / 4)
						},
						token,
					),
				)
			]);
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(
				`File created at ${this.promptPathRepresentationService.getFilePath(uri)}`,
			)
		]);
	}

	/**
	 * Don't copy this helper, this is generally not a good pattern because it's vulnerable to race conditions. But the fileSystemService doesn't give us a proper atomic method for this.
	 */
	private async fileExists(uri: URI): Promise<boolean> {
		try {
			await this.fileSystemService.stat(uri);
			return true;
		} catch (e) {
			return false;
		}
	}

	async resolveInput(input: ICreateFileParams, promptContext: IBuildPromptContext): Promise<ICreateFileParams> {
		this._promptContext = promptContext;
		return input;
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateFileParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const uri = resolveToolInputPath(options.input.filePath, this.promptPathRepresentationService);
		const content = options.input.content || '';

		const confirmation = await this.instantiationService.invokeFunction(
			createEditConfirmation,
			[uri],
			this._promptContext?.allowedEditUris,
			async () => this.instantiationService.invokeFunction(
				formatDiffAsUnified,
				uri,
				'', // Empty initial content
				content
			),
			options.forceConfirmationReason
		);

		return {
			...confirmation,
			presentation: undefined,
			invocationMessage: new MarkdownString(l10n.t`Creating ${formatUriForFileWidget(uri)}`),
			pastTenseMessage: new MarkdownString(l10n.t`Created ${formatUriForFileWidget(uri)}`)
		};
	}

	async handleToolStream(options: vscode.LanguageModelToolInvocationStreamOptions<ICreateFileParams>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolStreamResult> {
		let invocationMessage: MarkdownString;

		// rawInput is now a partial object (parsed via tryParsePartialToolInput)
		const partialInput = options.rawInput as Partial<ICreateFileParams> | undefined;

		if (partialInput && typeof partialInput === 'object') {
			const filePath = partialInput.filePath;
			const content = partialInput.content;

			if (filePath && content !== undefined) {
				const uri = resolveToolInputPath(filePath, this.promptPathRepresentationService);
				const lineCount = count(content, '\n') + 1;
				invocationMessage = new MarkdownString(l10n.t`Creating ${formatUriForFileWidget(uri)} (${lineCount} lines)`);
			} else if (content !== undefined) {
				const lineCount = count(content, '\n') + 1;
				invocationMessage = new MarkdownString(l10n.t`Creating file (${lineCount} lines)`);
			} else {
				invocationMessage = new MarkdownString(l10n.t`Creating file`);
			}
		} else {
			invocationMessage = new MarkdownString(l10n.t`Creating file`);
		}

		return {
			invocationMessage,
		};
	}

	private sendTelemetry(requestId: string | undefined, model: string | undefined, fileExtension: string) {
		/* __GDPR__
			"createFileToolInvoked" : {
				"owner": "bhavyaus",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"fileExtension": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The file extension of the created file" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('createFileToolInvoked', {
			requestId,
			model,
			fileExtension
		});
	}
}

ToolRegistry.registerTool(CreateFileTool);
