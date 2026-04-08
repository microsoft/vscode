/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { StringTextDocumentWithLanguageId } from '../../../platform/editing/common/abstractText';
import { NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEditSurvivalTrackerService, IEditSurvivalTrackingSession } from '../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ILogService } from '../../../platform/log/common/logService';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { IAlternativeNotebookContentEditGenerator, NotebookEditGenerationTelemtryOptions, NotebookEditGenrationSource } from '../../../platform/notebook/common/alternativeContentEditGenerator';
import { getDefaultLanguage } from '../../../platform/notebook/common/helpers';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { emitEditSurvivalEvent } from '../../../platform/otel/common/genAiEvents';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService, multiplexProperties } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { removeLeadingFilepathComment } from '../../../util/common/markdown';
import { findNotebook } from '../../../util/common/notebooks';
import { mapFindFirst } from '../../../util/vs/base/common/arraysFind';
import { timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { count } from '../../../util/vs/base/common/strings';
import { isDefined } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditorData, ChatResponseTextEditPart, ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString, Position, Range, WorkspaceEdit } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ApplyPatchFormatInstructions } from '../../prompts/node/agent/defaultAgentInstructions';
import { PromptRenderer, renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { processFullRewriteNotebook } from '../../prompts/node/codeMapper/codeMapper';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { IEditToolLearningService } from '../common/editToolLearningService';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { formatUriForFileWidget } from '../common/toolUtils';
import { PATCH_PREFIX, PATCH_SUFFIX } from './applyPatch/parseApplyPatch';
import { ActionType, Commit, DiffError, FileChange, identify_files_added, identify_files_affected, identify_files_needed, InvalidContextError, InvalidPatchFormatError, processPatch } from './applyPatch/parser';
import { EditFileResult, IEditedFile } from './editFileToolResult';
import { canExistingFileBeEdited, createEditConfirmation, formatDiffAsUnified, getDisallowedEditUriError, logEditToolResult, openDocumentAndSnapshot } from './editFileToolUtils';
import { sendEditNotebookTelemetry } from './editNotebookTool';
import { assertFileNotContentExcluded, resolveToolInputPath } from './toolUtils';

export interface IApplyPatchToolParams {
	input: string;
	explanation: string;
}

type DocText = Record</* URI */ string, { text: string; notebookUri?: URI }>;

export const applyPatch5Description = 'Use the `apply_patch` tool to edit files.\nYour patch language is a stripped-down, file-oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high-level envelope:\n\n*** Begin Patch\n[ one or more file sections ]\n*** End Patch\n\nWithin that envelope, you get a sequence of file operations.\nYou MUST include a header to specify the action you are taking.\nEach operation starts with one of three headers:\n\n*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).\n*** Delete File: <path> - remove an existing file. Nothing follows.\n*** Update File: <path> - patch an existing file in place (optionally with a rename).\n\nMay be immediately followed by *** Move to: <new path> if you want to rename the file.\nThen one or more “hunks”, each introduced by @@ (optionally followed by a hunk header).\nWithin a hunk each line starts with:\n\nFor instructions on [context_before] and [context_after]:\n- By default, show 3 lines of code immediately above and 3 lines immediately below each change. If a change is within 3 lines of a previous change, do NOT duplicate the first change\'s [context_after] lines in the second change\'s [context_before] lines.\n- If 3 lines of context is insufficient to uniquely identify the snippet of code within the file, use the @@ operator to indicate the class or function to which the snippet belongs. For instance, we might have:\n@@ class BaseClass\n[3 lines of pre-context]\n- [old_code]\n+ [new_code]\n[3 lines of post-context]\n\n- If a code block is repeated so many times in a class or function such that even a single `@@` statement and 3 lines of context cannot uniquely identify the snippet of code, you can use multiple `@@` statements to jump to the right context. For instance:\n\n@@ class BaseClass\n@@ \t def method():\n[3 lines of pre-context]\n- [old_code]\n+ [new_code]\n[3 lines of post-context]\n\nThe full grammar definition is below:\nPatch := Begin { FileOp } End\nBegin := "*** Begin Patch" NEWLINE\nEnd := "*** End Patch" NEWLINE\nFileOp := AddFile | DeleteFile | UpdateFile\nAddFile := "*** Add File: " path NEWLINE { "+" line NEWLINE }\nDeleteFile := "*** Delete File: " path NEWLINE\nUpdateFile := "*** Update File: " path NEWLINE [ MoveTo ] { Hunk }\nMoveTo := "*** Move to: " newPath NEWLINE\nHunk := "@@" [ header ] NEWLINE { HunkLine } [ "*** End of File" NEWLINE ]\nHunkLine := (" " | "-" | "+") text NEWLINE\n\nA full patch can combine several operations:\n\n*** Begin Patch\n*** Add File: hello.txt\n+Hello world\n*** Update File: src/app.py\n*** Move to: src/main.py\n@@ def greet():\n-print("Hi")\n+print("Hello, world!")\n*** Delete File: obsolete.txt\n*** End Patch\n\nIt is important to remember:\n\n- You must include a header with your intended action (Add/Delete/Update)\n- You must prefix new lines with `+` even when creating a new file\n- File references must be ABSOLUTE, NEVER RELATIVE.';

export class ApplyPatchTool implements ICopilotTool<IApplyPatchToolParams> {
	public static toolName = ToolName.ApplyPatch;
	public static readonly nonDeferred = true;

	private _promptContext: IBuildPromptContext | undefined;

	// Simple cache using stringified params as key to avoid WeakMap stability issues
	private lastProcessed: { input: string; output: Promise<{ commit: Commit; docTexts: DocText; healed?: string }> } | undefined;

	constructor(
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkspaceService protected readonly workspaceService: IWorkspaceService,
		@IToolsService protected readonly toolsService: IToolsService,
		@INotebookService protected readonly notebookService: INotebookService,
		@IFileSystemService protected readonly fileSystemService: IFileSystemService,
		@ILanguageDiagnosticsService protected readonly languageDiagnosticsService: ILanguageDiagnosticsService,
		@IEditSurvivalTrackerService private readonly _editSurvivalTrackerService: IEditSurvivalTrackerService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IAlternativeNotebookContentEditGenerator private readonly alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IEditToolLearningService private readonly editToolLearningService: IEditToolLearningService,
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly _otelService: IOTelService,
	) { }

	private getTrailingDocumentEmptyLineCount(document: TextDocumentSnapshot): number {
		let trailingEmptyLines = 0;
		for (let i = document.lineCount - 1; i >= 0; i--) {
			const line = document.lineAt(i);
			if (line.text.trim() === '') {
				trailingEmptyLines++;
			} else {
				break;
			}
		}
		return trailingEmptyLines;
	}

	private getTrailingArrayEmptyLineCount(lines: readonly string[]): number {
		let trailingEmptyLines = 0;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i].trim() === '') {
				trailingEmptyLines++;
			} else {
				break;
			}
		}
		return trailingEmptyLines;
	}

	private async generateUpdateTextDocumentEdit(textDocument: TextDocumentSnapshot, file: string, change: FileChange, workspaceEdit: WorkspaceEdit) {
		const uri = resolveToolInputPath(file, this.promptPathRepresentationService);
		const newContent = removeLeadingFilepathComment(change.newContent ?? '', textDocument.languageId, file);

		const lines = newContent?.split('\n') ?? [];
		let path = uri;
		if (change.movePath) {
			const newPath = resolveToolInputPath(change.movePath, this.promptPathRepresentationService);
			workspaceEdit.renameFile(path, newPath, { overwrite: true });
			path = newPath;
		}
		workspaceEdit.replace(path, new Range(
			new Position(0, 0),
			new Position(lines.length, 0)
		), newContent);

		// Handle trailing newlines to match the original document
		const originalTrailing = this.getTrailingDocumentEmptyLineCount(textDocument);
		const newTrailing = this.getTrailingArrayEmptyLineCount(lines);

		for (let i = newTrailing; i < originalTrailing; i++) {
			workspaceEdit.insert(path, new Position(lines.length + i, 0), '\n');
		}

		// If new content is shorter than original, delete extra lines
		if (lines.length < textDocument.lineCount) {
			const newLineCount = lines.length + Math.max(originalTrailing - newTrailing, 0);
			const from = lines.length === 0 ? new Position(0, 0) : new Position(newLineCount, 0);
			workspaceEdit.delete(path, new Range(from, new Position(textDocument.lineCount, 0)));
		}

		return path;
	}

	private async generateUpdateNotebookDocumentEdit(altDoc: NotebookDocumentSnapshot, uri: URI, file: string, change: FileChange) {
		// Notebooks can have various formats, it could be JSON, XML, Jupytext (which is a format that depends on the code cell language).
		// Lets generate new content based on multiple formats.
		const cellLanguage = getDefaultLanguage(altDoc.document) || 'python';
		// The content thats smallest is size is the one we're after, as thats the one that would have the leading file path removed.
		const newContent = [
			removeLeadingFilepathComment(change.newContent ?? '', cellLanguage, file),
			removeLeadingFilepathComment(change.newContent ?? '', 'python', file),
			removeLeadingFilepathComment(change.newContent ?? '', 'xml', file),
			removeLeadingFilepathComment(change.newContent ?? '', 'json', file),
			removeLeadingFilepathComment(change.newContent ?? '', 'text', file),
		].reduce((a, b) => a.length < b.length ? a : b);

		const edits: (vscode.NotebookEdit | [vscode.Uri, vscode.TextEdit[]])[] = [];
		if (change.movePath) {
			const newPath = resolveToolInputPath(change.movePath, this.promptPathRepresentationService);
			// workspaceEdit.renameFile(path, newPath, { overwrite: true });
			// TODO@joyceerhl: this is a hack, it doesnt't work for regular text files either.
			uri = newPath;
		}

		const telemetryOptions: NotebookEditGenerationTelemtryOptions = {
			source: NotebookEditGenrationSource.applyPatch,
			requestId: this._promptContext?.requestId,
			model: this._promptContext?.request?.model ? this.endpointProvider.getChatEndpoint(this._promptContext?.request?.model).then(m => m.model) : undefined
		};
		await processFullRewriteNotebook(altDoc.document, newContent, {
			notebookEdit(_, notebookEdits) {
				edits.push(...(Array.isArray(notebookEdits) ? notebookEdits : [notebookEdits]));
			},
			textEdit(target, textEdits) {
				textEdits = Array.isArray(textEdits) ? textEdits : [textEdits];
				edits.push([target, textEdits]);
			},
		}, this.alternativeNotebookEditGenerator, telemetryOptions, CancellationToken.None);

		return { path: uri, edits };
	}

	async handleToolStream(options: vscode.LanguageModelToolInvocationStreamOptions<IApplyPatchToolParams>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolStreamResult> {
		const partialInput = options.rawInput as Partial<IApplyPatchToolParams> | undefined;

		let invocationMessage: MarkdownString;
		if (partialInput && typeof partialInput === 'object' && partialInput.input) {
			const lineCount = count(partialInput.input, '\n') + 1;
			const files = [...identify_files_needed(partialInput.input), ...identify_files_added(partialInput.input)]
				.map(f => this.promptPathRepresentationService.resolveFilePath(f))
				.filter(isDefined)
				.map(uri => formatUriForFileWidget(uri));
			if (files.length > 0) {
				const fileNames = files.join(', ');
				invocationMessage = new MarkdownString(l10n.t`Generating patch (${lineCount} lines) in ${fileNames}`);
			} else {
				invocationMessage = new MarkdownString(l10n.t`Generating patch (${lineCount} lines)`);
			}
		} else {
			invocationMessage = new MarkdownString(l10n.t`Generating patch`);
		}

		return { invocationMessage };
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IApplyPatchToolParams>, token: vscode.CancellationToken) {
		if (!options.input.input || !this._promptContext?.stream) {
			this.sendApplyPatchTelemetry('invalidInput', options, undefined, false, undefined);
			throw new Error('Missing patch text or stream');
		}

		let commit: Commit | undefined;
		let healed: string | undefined;
		const docText: DocText = {};

		try {
			if (this.lastProcessed?.input === options.input.input) {
				const cached = await this.lastProcessed.output;
				commit = cached.commit;
				healed = cached.healed;
				Object.assign(docText, cached.docTexts);
				logEditToolResult(this.logService, options.chatRequestId, { input: options.input.input, success: true, healed });
				this.lastProcessed = undefined;
			}

			// If not cached or cache failed, build with healing
			if (!commit) {
				({ commit, healed } = await this.buildCommitWithHealing(options.model, options.input.input, docText, options.input.explanation, token));
				logEditToolResult(this.logService, options.chatRequestId, { input: options.input.input, success: true, healed });
			}
		} catch (error) {
			if (error instanceof HealedError) {
				healed = error.healedPatch;
				error = error.originalError;
			}
			const notebookUri = mapFindFirst(Object.values(docText), v => v.notebookUri);

			if (error instanceof InvalidContextError) {
				this.sendApplyPatchTelemetry(error.kindForTelemetry, options, error.file, !!healed, !!notebookUri);
			} else if (error instanceof InvalidPatchFormatError) {
				this.sendApplyPatchTelemetry(error.kindForTelemetry, options, '', !!healed, !!notebookUri);
			} else {
				this.sendApplyPatchTelemetry('processPatchFailed', options, error.file, !!healed, !!notebookUri, error);
			}

			logEditToolResult(this.logService, options.chatRequestId, { input: options.input.input, success: false, healed });


			if (notebookUri) {
				// We have found issues with the patches generated by Model for XML, Jupytext
				// Possible there are other issues with other formats as well.
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Applying patch failed with error: ' + error.message),
					new LanguageModelTextPart(`Use the ${ToolName.EditNotebook} tool to edit notebook files such as ${notebookUri}.`),
				]);

			} else {
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Applying patch failed with error: ' + error.message),
				]);
			}
		}

		try {
			// Map to track edit survival sessions by document URI
			const editSurvivalTrackers = new ResourceMap<IEditSurvivalTrackingSession>();

			// Set up a response stream that will collect AI edits for telemetry
			let responseStream = this._promptContext.stream;
			if (this._promptContext.stream) {
				responseStream = ChatResponseStreamImpl.spy(this._promptContext.stream, (part) => {
					if (part instanceof ChatResponseTextEditPart && !this.notebookService.hasSupportedNotebooks(part.uri)) {
						const tracker = editSurvivalTrackers.get(part.uri);
						if (tracker) {
							tracker.collectAIEdits(part.edits);
						}
					}
				});
			}

			const resourceToOperation = new ResourceMap<{ action: ActionType.ADD | ActionType.DELETE } | { action: ActionType.UPDATE; updated: TextDocumentSnapshot | NotebookDocumentSnapshot | undefined }>();
			const workspaceEdit = new WorkspaceEdit();
			const notebookEdits = new ResourceMap<(vscode.NotebookEdit | [vscode.Uri, vscode.TextEdit[]])[]>();
			const deletedFiles = new ResourceSet();
			for (const [file, changes] of Object.entries(commit.changes)) {
				let path = resolveToolInputPath(file, this.promptPathRepresentationService);
				const disallowedUriError = getDisallowedEditUriError(path, this._promptContext?.allowedEditUris, this.promptPathRepresentationService);
				if (disallowedUriError) {
					const result = new ExtendedLanguageModelToolResult([
						new LanguageModelTextPart(disallowedUriError),
					]);
					result.hasError = true;
					return result;
				}
				await this.instantiationService.invokeFunction(accessor => assertFileNotContentExcluded(accessor, path));

				switch (changes.type) {
					case ActionType.ADD: {
						if (changes.newContent) {
							workspaceEdit.insert(path, new Position(0, 0), changes.newContent);
							resourceToOperation.set(path, { action: ActionType.ADD });
						}
						break;
					}
					case ActionType.DELETE: {
						workspaceEdit.deleteFile(path);
						resourceToOperation.set(path, { action: ActionType.DELETE });
						deletedFiles.add(path);
						break;
					}
					case ActionType.UPDATE: {
						const document = await this.instantiationService.invokeFunction(openDocumentAndSnapshot, this._promptContext, path);
						let updated: TextDocumentSnapshot | NotebookDocumentSnapshot | undefined;

						if (document instanceof NotebookDocumentSnapshot) {
							// We have found issues with the patches generated by Model for XML, Jupytext
							// Possible there are other issues with other formats as well.
							try {
								const result = await this.generateUpdateNotebookDocumentEdit(document, path, file, changes);
								notebookEdits.set(result.path, result.edits);
								path = result.path;
								if (changes.newContent) {
									updated = NotebookDocumentSnapshot.fromNewText(changes.newContent, document);
								}
							} catch (error) {
								this.sendApplyPatchTelemetry('invalidNotebookEdit', options, document.getText(), !!healed, true, error);
								return new LanguageModelToolResult([
									new LanguageModelTextPart('Applying patch failed with error: ' + error.message),
									new LanguageModelTextPart(`Use the ${ToolName.EditNotebook} tool to edit notebook files such as ${file}.`),
								]);
							}
						}
						else {
							path = await this.generateUpdateTextDocumentEdit(document, file, changes, workspaceEdit);
							if (changes.newContent) {
								updated = TextDocumentSnapshot.fromNewText(changes.newContent, document);
							}
						}
						resourceToOperation.set(path, { action: ActionType.UPDATE, updated });
						break;
					}
				}
			}

			const files: IEditedFile[] = [];
			const handledNotebookUris = new ResourceSet();
			const editEntires = workspaceEdit.entries();
			if (notebookEdits.size > 0) {
				for (const uri of notebookEdits.keys()) {
					editEntires.push([uri, []]);
				}
			}
			for (let [uri, textEdit] of editEntires) {
				// Get the notebook URI if the document is a notebook or a notebook cell.
				const notebookUri = findNotebook(uri, this.workspaceService.notebookDocuments)?.uri ?? (this.notebookService.hasSupportedNotebooks(uri) ? uri : undefined);
				if (notebookUri) {
					if (handledNotebookUris.has(notebookUri)) {
						continue;
					}
					handledNotebookUris.add(notebookUri);
				}
				uri = notebookUri || uri;

				const existingDiagnostics = this.languageDiagnosticsService.getDiagnostics(uri);

				// Initialize edit survival tracking for text documents
				const existsOnDisk = await this.instantiationService.invokeFunction(canExistingFileBeEdited, uri);
				if (existsOnDisk) {
					const document = notebookUri ?
						await this.workspaceService.openNotebookDocumentAndSnapshot(notebookUri, this.alternativeNotebookContent.getFormat(this._promptContext?.request?.model)) :
						await this.workspaceService.openTextDocumentAndSnapshot(uri);
					if (document instanceof TextDocumentSnapshot) {
						const tracker = this._editSurvivalTrackerService.initialize(document.document);
						editSurvivalTrackers.set(uri, tracker);
					}
				}

				if (notebookUri) {
					responseStream.notebookEdit(notebookUri, []);
					const edits = notebookEdits.get(notebookUri) || [];
					for (const edit of edits) {
						if (Array.isArray(edit)) {
							responseStream.textEdit(edit[0], edit[1]);
						} else {
							responseStream.notebookEdit(notebookUri, edit);
						}
					}
					responseStream.notebookEdit(notebookUri, true);
					sendEditNotebookTelemetry(this.telemetryService, this.endpointProvider, 'applyPatch', notebookUri, this._promptContext.requestId, options.model ?? this._promptContext.request?.model);
				} else {
					this._promptContext.stream.markdown('\n```\n');
					this._promptContext.stream.codeblockUri(notebookUri || uri, true);

					responseStream.textEdit(uri, textEdit);
					responseStream.textEdit(uri, true);
					this._promptContext.stream.markdown('\n' + '```\n');
				}

				const opResult = resourceToOperation.get(uri);
				if (opResult?.action === ActionType.UPDATE && opResult.updated) {
					this._promptContext.turnEditedDocuments ??= new ResourceMap();
					this._promptContext.turnEditedDocuments.set(uri, opResult.updated);
				}
				files.push({ uri, isNotebook: !!notebookUri, existingDiagnostics, operation: opResult?.action ?? ActionType.UPDATE });
			}
			if (deletedFiles.size > 0) {
				responseStream.workspaceEdit([...deletedFiles].map(oldResource => ({ oldResource })));
				for (const uri of deletedFiles) {
					files.push({ uri, isNotebook: false, existingDiagnostics: [], operation: ActionType.DELETE });
				}
			}

			if (healed && files.length) {
				files[0].healed = healed;
			}

			timeout(2000).then(() => {
				// The tool can't wait for edits to be applied, so just wait before starting the survival tracker.
				// TODO@roblourens see if this improves the survival metric, find a better fix.
				for (const tracker of editSurvivalTrackers.values()) {
					tracker.startReporter(res => {
						/* __GDPR__
							"applyPatch.trackEditSurvival" : {
								"owner": "joyceerhl",
								"comment": "Tracks how much percent of the AI edits survived after 5 minutes of accepting",
								"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
								"requestSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source from where the request was made" },
								"mapper": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The code mapper used strategy" },
								"survivalRateFourGram": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the AI edit is still present in the document." },
								"survivalRateNoRevert": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the ranges the AI touched ended up being reverted." },
								"didBranchChange": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Indicates if the branch changed in the meantime. If the branch changed (value is 1), this event should probably be ignored." },
								"timeDelayMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time delay between the user accepting the edit and measuring the survival rate." }
							}
						*/
						res.telemetryService.sendMSFTTelemetryEvent('applyPatch.trackEditSurvival', { requestId: this._promptContext?.requestId, requestSource: 'agent', mapper: 'applyPatchTool' }, {
							survivalRateFourGram: res.fourGram,
							survivalRateNoRevert: res.noRevert,
							timeDelayMs: res.timeDelayMs,
							didBranchChange: res.didBranchChange ? 1 : 0,
						});
						res.telemetryService.sendInternalMSFTTelemetryEvent('applyPatch.trackEditSurvival', {
							requestId: this._promptContext?.requestId,
							requestSource: 'agent',
							mapper: 'applyPatchTool',
							textBeforeAiEdits: res.textBeforeAiEdits ? JSON.stringify(res.textBeforeAiEdits) : undefined,
							textAfterAiEdits: res.textAfterAiEdits ? JSON.stringify(res.textAfterAiEdits) : undefined,
							textAfterUserEdits: res.textAfterUserEdits ? JSON.stringify(res.textAfterUserEdits) : undefined,
						}, {
							survivalRateFourGram: res.fourGram,
							survivalRateNoRevert: res.noRevert,
							timeDelayMs: res.timeDelayMs,
							didBranchChange: res.didBranchChange ? 1 : 0,
						});
						res.telemetryService.sendGHTelemetryEvent('applyPatch/trackEditSurvival', {
							headerRequestId: this._promptContext?.requestId,
							requestSource: 'agent',
							mapper: 'applyPatchTool',
							headBranchName: res.workspace?.headBranchName,
							headCommitHash: res.workspace?.headCommitHash,
							remoteUrl: res.workspace?.remoteUrl,
							fileRelativePath: res.workspace?.fileRelativePath,
						}, {
							survivalRateFourGram: res.fourGram,
							survivalRateNoRevert: res.noRevert,
							timeDelayMs: res.timeDelayMs,
							didBranchChange: res.didBranchChange ? 1 : 0,
						});

						emitEditSurvivalEvent(this._otelService, 'apply_patch', res.fourGram, res.noRevert, res.timeDelayMs, res.didBranchChange, this._promptContext?.requestId ?? '', res.workspace);
						GenAiMetrics.recordEditSurvivalFourGram(this._otelService, 'apply_patch', res.fourGram, res.timeDelayMs);
						GenAiMetrics.recordEditSurvivalNoRevert(this._otelService, 'apply_patch', res.noRevert, res.timeDelayMs);
					});
				}
			});

			// Return the result
			const isInlineChat = this._promptContext.request?.location2 instanceof ChatRequestEditorData;
			const isNotebook = editEntires.length === 1 ? handledNotebookUris.size === 1 : undefined;
			this.sendApplyPatchTelemetry('success', options, undefined, !!healed, isNotebook);
			const result = new ExtendedLanguageModelToolResult([
				new LanguageModelPromptTsxPart(
					await renderPromptElementJSON(
						this.instantiationService,
						EditFileResult,
						{ files, diagnosticsTimeout: isInlineChat ? -1 : 2000, toolName: ToolName.ApplyPatch, requestId: options.chatRequestId, model: options.model },
						options.tokenizationOptions ?? {
							tokenBudget: 1000,
							countTokens: (t) => Promise.resolve(t.length * 3 / 4)
						},
						token,
					),
				)
			]);
			result.hasError = files.some(f => f.error);
			return result;
		} catch (error) {
			const isNotebook = Object.values(docText).length === 1 ? (!!mapFindFirst(Object.values(docText), v => v.notebookUri)) : undefined;
			// TODO parser.ts could annotate DiffError with a telemetry detail if we want
			this.sendApplyPatchTelemetry('error', options, undefined, false, isNotebook, error);
			const result = new ExtendedLanguageModelToolResult([
				new LanguageModelTextPart('Applying patch failed with error: ' + error.message),
			]);
			result.hasError = true;
			return result;
		}
	}

	/**
	 * Attempts to 'heal' a patch which we failed to apply by sending it a small
	 * cheap model (4o mini) to revise it. This is generally going to be cheaper
	 * than going to whatever big model the user has selected for it to try
	 * and do another turn.
	 */
	private async healCommit(patch: string, docs: DocText, explanation: string, token: CancellationToken) {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const prompt = await PromptRenderer.create(
			this.instantiationService,
			endpoint,
			HealPatchPrompt,
			{
				patch,
				explanation,
				docs
			}
		).render(undefined, token);

		const fetchResult = await endpoint.makeChatRequest2({
			debugName: 'healApplyPatch',
			messages: prompt.messages,
			finishedCb: undefined,
			location: ChatLocation.Other,
			enableRetryOnFilter: true
		}, token);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		const patchStart = fetchResult.value.lastIndexOf(PATCH_PREFIX);
		if (patchStart === -1) {
			return undefined;
		}

		const patchEnd = fetchResult.value.indexOf(PATCH_SUFFIX, patchStart);
		return patchEnd === -1 ? fetchResult.value.slice(patchStart) : fetchResult.value.slice(patchStart, patchEnd + PATCH_SUFFIX.length);
	}

	private async buildCommitWithHealing(model: vscode.LanguageModelChat | undefined, patch: string, docText: DocText, explanation: string, token: CancellationToken): Promise<{ commit: Commit; healed?: string }> {
		try {
			const result = await this.buildCommit(patch, docText);
			if (model) {
				this.editToolLearningService.didMakeEdit(model, ToolName.ApplyPatch, true);
			}
			return result;
		} catch (error) {
			if (!(error instanceof DiffError)) {
				throw error;
			}
			if (model) {
				this.editToolLearningService.didMakeEdit(model, ToolName.ApplyPatch, false);
			}

			let success = true;
			let healed: string | undefined;
			try {
				healed = await this.healCommit(patch, docText, explanation, token);

				if (!healed) {
					throw error;
				}

				const { commit } = await this.buildCommit(healed, docText);
				return { commit, healed };
			} catch (healedError) {
				success = false;
				if (healed) {
					throw new HealedError(error, healedError, healed);
				} else {
					throw error;
				}
			} finally {
				/* __GDPR__
					"applyPatchHealRate" : {
						"owner": "connor4312",
						"comment": "Records how correct the healing of a patch was",
						"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the input was healed" }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('applyPatchHealRate', {}, {
					success: success ? 1 : 0,
				});
			}
		}
	}

	private async buildCommit(patch: string, docText: DocText): Promise<{ commit: Commit; docTexts: DocText }> {
		const commit = await processPatch(patch, async (uri) => {
			const vscodeUri = resolveToolInputPath(uri, this.promptPathRepresentationService);
			if (this.notebookService.hasSupportedNotebooks(vscodeUri)) {
				const notebookUri = findNotebook(vscodeUri, this.workspaceService.notebookDocuments)?.uri || vscodeUri;
				const altDoc = await this.workspaceService.openNotebookDocumentAndSnapshot(notebookUri, this.alternativeNotebookContent.getFormat(this._promptContext?.request?.model));
				docText[vscodeUri.toString()] = { text: altDoc.getText(), notebookUri };
				return new StringTextDocumentWithLanguageId(altDoc.getText(), altDoc.languageId);
			} else {
				const textDocument = await this.workspaceService.openTextDocument(vscodeUri);
				docText[vscodeUri.toString()] = { text: textDocument.getText() };
				return textDocument;
			}
		});
		return { commit, docTexts: docText };
	}

	private async sendApplyPatchTelemetry(outcome: string, options: vscode.LanguageModelToolInvocationOptions<IApplyPatchToolParams>, file: string | undefined, healed: boolean, isNotebook: boolean | undefined, unexpectedError?: Error) {
		const model = options.model && (await this.endpointProvider.getChatEndpoint(options.model)).model;

		/* __GDPR__
			"applyPatchToolInvoked" : {
				"owner": "roblourens",
				"comment": "The apply_patch tool was invoked",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"interactionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current interaction." },
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the invocation was successful, or a failure reason" },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
				"healed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the input was healed" },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the input was a notebook, 1 = yes, 0 = no, other = Unknown" },
				"error": { "classification": "CallstackOrException", "purpose": "FeatureInsight", "comment": "Unexpected error that occurrs during application" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('applyPatchToolInvoked',
			{
				requestId: options.chatRequestId,
				interactionId: options.chatRequestId,
				outcome,
				model,
				error: unexpectedError?.stack || unexpectedError?.message,
			},
			{
				healed: healed ? 1 : 0,
				isNotebook: isNotebook ? 1 : (isNotebook === false ? 0 : -1), // -1 means unknown
			},
		);

		this.telemetryService.sendEnhancedGHTelemetryEvent('applyPatchTool', multiplexProperties({
			headerRequestId: options.chatRequestId,
			baseModel: model,
			messageText: file,
			completionTextJson: options.input.input,
			postProcessingOutcome: outcome,
			healed: String(healed),
		}));
	}

	async resolveInput(input: IApplyPatchToolParams, promptContext: IBuildPromptContext): Promise<IApplyPatchToolParams> {
		this._promptContext = promptContext;
		return input;
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IApplyPatchToolParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const uris = [...identify_files_affected(options.input.input)].map(f => URI.file(f));

		return this.instantiationService.invokeFunction(
			createEditConfirmation,
			uris,
			this._promptContext?.allowedEditUris,
			(urisNeedingConfirmation) => this.generatePatchConfirmationDetails(options, urisNeedingConfirmation, token),
			options.forceConfirmationReason
		);
	}

	private async generatePatchConfirmationDetails(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IApplyPatchToolParams>,
		urisNeedingConfirmation: readonly URI[],
		token: CancellationToken
	): Promise<string> {
		const instantiationService = this.instantiationService;
		const promptPathRepresentationService = this.promptPathRepresentationService;

		// Process the patch and cache it for later use in invoke()
		const docTexts: DocText = {};
		const processPromise = (async () => {
			const { commit, healed } = await this.buildCommitWithHealing(
				this._promptContext?.request?.model,
				options.input.input,
				docTexts,
				options.input.explanation,
				token
			);
			return { commit, docTexts, healed };
		})();

		// Cache using stringified params
		this.lastProcessed = { input: options.input.input, output: processPromise };

		const { commit } = await processPromise;

		// Create a set of URIs needing confirmation for quick lookup
		const urisNeedingConfirmationSet = new ResourceSet(urisNeedingConfirmation);

		// Generate diffs for all file changes in parallel
		const diffResults = await Promise.all(
			Object.entries(commit.changes).map(async ([file, changes]) => {
				const uri = resolveToolInputPath(file, promptPathRepresentationService);
				const moveTo = changes.movePath ? resolveToolInputPath(changes.movePath, promptPathRepresentationService) : undefined;
				if (!urisNeedingConfirmationSet.has(uri) && !(moveTo && urisNeedingConfirmationSet.has(moveTo))) {
					return;
				}

				if (changes.type === ActionType.DELETE) {
					return l10n.t`Delete ${formatUriForFileWidget(uri)}`;
				}

				let diff = await instantiationService.invokeFunction(
					formatDiffAsUnified,
					uri,
					changes.oldContent || '',
					changes.newContent || ''
				);

				if (moveTo) {
					diff = l10n.t`Move from ${formatUriForFileWidget(uri)} to ${formatUriForFileWidget(moveTo)}\n\n` + diff;
				}

				return diff;
			})
		);

		const diffParts = diffResults.filter(isDefined);
		return diffParts.length > 0 ? diffParts.join('\n\n') : 'No changes detected.';
	}
}

class HealedError extends Error {
	constructor(
		public readonly originalError: Error,
		public readonly errorWithHealing: Error,
		public readonly healedPatch: string,
	) {
		super(`Healed error: ${errorWithHealing}, original error: ${originalError}`);
	}
}

ToolRegistry.registerTool(ApplyPatchTool);

const applyPatchExample = `*** Begin Patch
*** Update File: /Users/someone/pygorithm/searching/binary_search.py
@@ class BaseClass
@@     def search():
         results = get_results()
-        results
+        return results
@@ class Subclass
@@     def search():
-        pass
+        raise NotImplementedError()
*** End Patch`;

class HealPatchPrompt extends PromptElement<{ patch: string; explanation: string; docs: DocText } & BasePromptElementProps, void> {
	override render(): PromptPiece | undefined {
		return <>
			<SystemMessage>
				You are an expert in file editing. The user has provided a patch that failed to apply because it references context that was not found precisely in the file. Your task is to fix the patch so it can be applied successfully.
				<Tag name='patchFormat'>
					The expected format for the patch is a diff format that modifications and include contextual lines around the changes. The patch should be formatted as follows:<br />
					<ApplyPatchFormatInstructions />
					The output MUST NOT actually include the string "[3 lines of pre-context]" or "[3 lines of post-context]" -- include the actual lines of context from the file. An example of a patch you might generate is shown below.<br />
					<br />
					```<br />
					{applyPatchExample}<br />
					```<br />
				</Tag>
				<Tag name='instructions'>
					1. Think carefully. Examine the provided patch, the included intent, the contents of the files it references.<br />
					2. Determine the locations in the files where the user intended the patch to be applied. Lines that don't begin with a plus "+" or "-" sign must be found verbatim in the original file, and ONLY lines to be added or removed should begin with a plus or minus sign respectively. It is very likely this rule is being broken by the invalid patch.<br />
					3. Generate the ENTIRE corrected patch. Do not omit anything.<br />
				</Tag>
			</SystemMessage>
			<UserMessage priority={1}>
				The goal of the patch is: {this.props.explanation}<br />
				<br />
				The patch I want to apply is:<br />
				<Tag name='invalidPatch'><br />
					{this.props.patch}<br />
				</Tag><br />
				<br />
				The referenced files are:<br />
				{Object.entries(this.props.docs).map(([file, { text }]) =>
					<CodeBlock code={text} uri={URI.parse(file)} priority={1} lineBasedPriority={true} />
				)}
			</UserMessage>
		</>;
	}
}
