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
import { Position as ExtPosition, Range as ExtRange, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString, TextEdit } from '../../../vscodeTypes';
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
import { FileCreateReservation, FileWriteSnapshot, getFileWriteGuard, getFileWriteLineage, isFileNotFound, readFileWriteState, StaleFileWriteError, throwIfFileWriteCancelled } from './fileWriteGuard';

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
		const promptContext = this._promptContext;
		const uri = this.promptPathRepresentationService.resolveFilePath(options.input.filePath);
		if (!uri) {
			throw new Error(`Invalid file path`);
		}

		if (!promptContext?.stream) {
			throw new Error('Invalid stream');
		}

		// Validate parameters
		if (!options.input.filePath || options.input.content === undefined) {
			throw new Error('Invalid input: filePath and content are required');
		}

		const guard = getFileWriteGuard(this.fileSystemService);
		const lineage = getFileWriteLineage(options, promptContext);
		const release = await guard.acquire([uri], token);
		let reservation: FileCreateReservation | undefined;
		let mutationStarted = false;
		let emitted = false;
		let prepared: FileWriteSnapshot[] = [];
		try {
			prepared = await guard.capture([uri], target => readFileWriteState(this.fileSystemService, target));
			guard.assertTracked(lineage, prepared);
			const fileExists = await this.fileExists(uri);
			const hasSupportedNotebooks = this.notebookService.hasSupportedNotebooks(uri);
			if (fileExists) {
				throw new Error(hasSupportedNotebooks
					? l10n.t('File already exists. You must use the {0} tool to modify it.', ToolName.EditNotebook)
					: l10n.t('File already exists. You must use an edit tool to modify it.'));
			}
			let doc: NotebookDocumentSnapshot | TextDocumentSnapshot | undefined;
			try {
				if (hasSupportedNotebooks) {
					doc = await this.workspaceService.openNotebookDocumentAndSnapshot(uri, this.alternativeNotebookContent.getFormat(promptContext.request?.model));
				} else {
					doc = await this.workspaceService.openTextDocumentAndSnapshot(uri);
				}
			} catch (error) {
				if (!isFileNotFound(error)) {
					throw error;
				}
			}

			const languageId = doc?.languageId ?? getLanguageForResource(uri).languageId;
			const fileExtension = extname(uri);
			const modelId = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;
			const notebookEdits: { target: vscode.Uri; edits: vscode.NotebookEdit | vscode.NotebookEdit[] }[] = [];

			if (hasSupportedNotebooks) {
				let content = options.input.content;
				const processor = new CodeBlockProcessor(() => undefined, () => undefined, codeBlock => content = codeBlock.code);
				processor.processMarkdown(options.input.content);
				processor.flush();
				content = removeLeadingFilepathComment(options.input.content, languageId, options.input.filePath);
				await processFullRewriteNewNotebook(uri, content, {
					textEdit: () => undefined,
					notebookEdit: (target, edits) => { notebookEdits.push({ target, edits }); },
				}, this.alternativeNotebookEditGenerator, { source: NotebookEditGenrationSource.createFile, requestId: options.chatRequestId, model: options.model ? this.endpointProvider.getChatEndpoint(options.model).then(m => m.model) : undefined }, token);
			}
			throwIfFileWriteCancelled(token);
			await guard.validate(lineage, prepared, [uri], target => readFileWriteState(this.fileSystemService, target));
			throwIfFileWriteCancelled(token);
			mutationStarted = true;
			reservation = await guard.reserveCreate(uri);
			if (!await reservation.verify()) {
				throw new StaleFileWriteError([uri]);
			}
			throwIfFileWriteCancelled(token);
			guard.emitted(lineage, prepared);
			emitted = true;
			if (hasSupportedNotebooks) {
				for (const edit of notebookEdits) {
					promptContext.stream.notebookEdit(edit.target, edit.edits);
				}
				promptContext.stream.notebookEdit(uri, true);
				this.sendTelemetry(options.chatRequestId, modelId, fileExtension);
			} else {
				const content = removeLeadingFilepathComment(options.input.content, languageId, options.input.filePath);
				// Replace a deleted file's stale buffer rather than prepending to it (microsoft/vscode#311043).
				if (doc && doc.getText().length > 0) {
					const lastLine = doc.lineCount - 1;
					promptContext.stream.textEdit(uri, TextEdit.replace(new ExtRange(0, 0, lastLine, doc.lineAt(lastLine).text.length), content));
				} else {
					promptContext.stream.textEdit(uri, TextEdit.insert(new ExtPosition(0, 0), content));
				}
				promptContext.stream.textEdit(uri, true);
				this.sendTelemetry(options.chatRequestId, modelId, fileExtension);
				return new LanguageModelToolResult([
					new LanguageModelPromptTsxPart(
						await renderPromptElementJSON(
							this.instantiationService,
							EditFileResult,
							{ files: [{ operation: ActionType.ADD, uri, isNotebook: false }], diagnosticsTimeout: 2000, toolName: ToolName.CreateFile, requestId: options.chatRequestId, model: options.model },
							options.tokenizationOptions ?? {
								tokenBudget: 1000,
								countTokens: t => Promise.resolve(t.length * 3 / 4)
							},
							token,
						),
					)
				]);
			}

			return new LanguageModelToolResult([
				new LanguageModelTextPart(`File created at ${this.promptPathRepresentationService.getFilePath(uri)}`)
			]);
		} catch (error) {
			if (mutationStarted && !emitted) {
				guard.emitted(lineage, prepared);
			}
			throw error;
		} finally {
			try {
				if (reservation && !emitted) {
					await reservation.rollback();
				}
			} finally {
				release();
			}
		}
	}

	/** Advisory check only; the native exclusive reservation is the no-overwrite gate. */
	private async fileExists(uri: URI): Promise<boolean> {
		try {
			await this.fileSystemService.stat(uri);
			return true;
		} catch (e) {
			if (isFileNotFound(e)) {
				return false;
			}
			throw e;
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
			options.forceConfirmationReason,
			undefined,
			options.workingDirectory,
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
