/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatResponseFileTreePart, ChatResponseStream, NotebookDocument } from 'vscode';
import { IChatMLFetcher, IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IConversationOptions } from '../../../platform/chat/common/conversationOptions';
import { ILogService } from '../../../platform/log/common/logService';
import { IResponseDelta } from '../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IAlternativeNotebookContentEditGenerator, NotebookEditGenerationTelemtryOptions, NotebookEditGenrationSource } from '../../../platform/notebook/common/alternativeContentEditGenerator';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { extractCodeBlocks, filepathCodeBlockMarker } from '../../../util/common/markdown';
import { extractNotebookOutline, INotebookSection } from '../../../util/common/notebooks';
import { AsyncIterableObject, AsyncIterableSource, DeferredPromise } from '../../../util/vs/base/common/async';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMarkdownPart, NotebookEdit, Uri, WorkspaceEdit } from '../../../vscodeTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IResponseProcessorContext } from '../../prompt/node/intents';
import { LineFilters, LineOfText, streamLines } from '../../prompt/node/streamingEdits';
import { renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { NewNotebookCodeGenerationPrompt, NewNotebookCodeImprovementPrompt } from '../../prompts/node/panel/newNotebook';
import { sendEditNotebookTelemetry } from '../../tools/node/editNotebookTool';
import { NewNotebookToolPrompt } from '../../tools/node/newNotebookTool';


export class NewNotebookResponseProcessor {

	private messageText = '';
	private stagedTextToApply = '';
	private reporting = true;
	private _resolvedContentDeferredPromise: DeferredPromise<ChatResponseFileTreePart | ChatResponseMarkdownPart> = new DeferredPromise();

	constructor(
		readonly endpoint: IChatEndpoint,
		readonly context: IBuildPromptContext | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IAlternativeNotebookContentEditGenerator private readonly noteBookEditGenerator: IAlternativeNotebookContentEditGenerator,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) { }

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: ChatResponseStream, token: CancellationToken): Promise<void> {
		const { turn, messages } = context;
		for await (const { delta } of inputStream) {
			if (token.isCancellationRequested) {
				return;
			}
			this.applyDelta(delta.text, turn, outputStream);
		}

		await this.pushCommands(messages, outputStream, token);
	}

	private applyDeltaToTurn(textDelta: string, turn: Turn,) {
		this.messageText += textDelta;
	}

	private applyDeltaToProgress(textDelta: string, progress: ChatResponseStream) {
		progress.markdown(textDelta);
	}

	private _incodeblock = false;
	private _presentCodeblockProgress = false;

	private applyDelta(textDelta: string, turn: Turn, progress: ChatResponseStream) {
		if (!this.reporting) {
			this.applyDeltaToTurn(textDelta, turn);
			return;
		}

		textDelta = this.stagedTextToApply + textDelta;

		if (this._incodeblock) {
			const codeblockEnd = textDelta.indexOf('```');
			if (codeblockEnd === -1) {
				// didn't find closing yet
				this.stagedTextToApply = textDelta;

				this.applyDeltaToTurn('', turn);
				if (!this._presentCodeblockProgress) {
					this._presentCodeblockProgress = true;
					progress.progress(l10n.t('Thinking ...'));
				}
				return;
			} else {
				// found closing
				this._incodeblock = false;
				textDelta = textDelta.substring(0, codeblockEnd) + '```';
				try {
					this.applyDeltaToTurn(textDelta, turn);
				} catch (_e) {
					// const errorMessage = (e as Error)?.message ?? 'Unknown error';
				} finally {
					this.reporting = false;
					this.stagedTextToApply = '';
					this._resolvedContentDeferredPromise.complete(new ChatResponseMarkdownPart(''));
				}
				return;
			}
		}

		const codeblockStart = textDelta.indexOf('```');
		if (codeblockStart !== -1) {
			this._incodeblock = true;
			const codeblockEnd = textDelta.indexOf('```', codeblockStart + 3);
			if (codeblockEnd !== -1) {
				this._incodeblock = false;
				this.applyDeltaToProgress(textDelta.substring(0, codeblockStart), progress);
				this.applyDeltaToProgress(textDelta.substring(codeblockEnd + 3), progress);
				this.applyDeltaToTurn(textDelta, turn);
				this.reporting = false;
				this.stagedTextToApply = '';

				return;
			} else {
				const textToReport = textDelta.substring(0, codeblockStart);
				this.applyDeltaToProgress(textToReport, progress);
				this.applyDeltaToTurn(textDelta, turn);
				this.stagedTextToApply = '';

				if (!this._presentCodeblockProgress) {
					this._presentCodeblockProgress = true;
					progress.progress(l10n.t('Thinking ...'));
				}

				this._resolvedContentDeferredPromise.p.then((p) => progress.push(p));
				return;
			}
		}

		// We have no stop word or partial, so apply the text to the progress and turn
		this.applyDeltaToProgress(textDelta, progress);
		this.applyDeltaToTurn(textDelta, turn);
		this.stagedTextToApply = '';
	}

	async pushCommands(history: readonly Raw.ChatMessage[], outputStream: ChatResponseStream, token: CancellationToken) {
		try {
			const outline = extractNotebookOutline(this.messageText);
			if (outline) {

				const mockContext: IBuildPromptContext = this.context ?? {
					query: '',
					history: [],
					chatVariables: new ChatVariablesCollection([]),
				};

				const { messages: generateMessages } = await renderPromptElement(
					this.instantiationService,
					this.endpoint,
					NewNotebookToolPrompt,
					{
						outline: outline,
						promptContext: mockContext,
						originalCreateNotebookQuery: mockContext.query,
						availableTools: this.context?.tools?.availableTools
					}
				);

				const sourceStream = new AsyncIterableSource<string>();
				const newNotebook = new Lazy(async () => {
					const notebook = await this.workspaceService.openNotebookDocument('jupyter-notebook');
					const updateMetadata = NotebookEdit.updateNotebookMetadata(Object.assign({ new_copilot_notebook: true }, notebook.metadata));
					const workspaceEdit = new WorkspaceEdit();
					workspaceEdit.set(notebook.uri, [updateMetadata]);
					await this.workspaceService.applyEdit(workspaceEdit);
					return notebook;
				});
				const sourceLines = filterFilePathFromCodeBlock2(streamLines(sourceStream.asyncIterable)
					.filter(LineFilters.createCodeBlockFilter())
					.map(line => {
						newNotebook.value; // force the notebook to be created
						return line;
					}));
				const created = this.createNewNotebook2(sourceLines, newNotebook.value, token);
				async function finishedCb(text: string, index: number, delta: IResponseDelta): Promise<number | undefined> {
					sourceStream.emitOne(delta.text);
					return undefined;
				}

				const generateResponse = await this.endpoint.makeChatRequest(
					'newNotebookCodeCell',
					generateMessages,
					finishedCb,
					token,
					ChatLocation.Panel
				);
				sourceStream.resolve();
				if (generateResponse.type !== ChatFetchResponseType.Success) {
					return [];
				}
				await created;
			} else {
				this.logService.error('No Notebook outline found: ', this.messageText);
			}
		} catch (ex) {
			this.logService.error('Error creating new notebook: ', ex);
		}

		return [];
	}

	// different than the one in the tool, this one can't rely on the output stream workaround
	private async createNewNotebook2(lines: AsyncIterable<LineOfText>, newNotebook: Promise<NotebookDocument>, token: CancellationToken) {
		const promises: Promise<unknown>[] = [];
		const telemetryOptions: NotebookEditGenerationTelemtryOptions = {
			source: NotebookEditGenrationSource.newNotebookIntent,
			requestId: this.context?.requestId,
			model: this.endpoint.model
		};
		for await (const edit of this.noteBookEditGenerator.generateNotebookEdits(Uri.file('empty.ipynb'), lines, telemetryOptions, token)) {
			if (!Array.isArray(edit)) {
				const notebook = await newNotebook;
				const workspaceEdit = new WorkspaceEdit();
				workspaceEdit.set(notebook.uri, [edit]);
				promises.push(Promise.resolve(this.workspaceService.applyEdit(workspaceEdit)));
			}
		}
		await Promise.all(promises);
		sendEditNotebookTelemetry(this.telemetryService, undefined, 'newNotebookIntent', (await newNotebook).uri, this.context?.requestId, undefined, this.endpoint);
		return newNotebook;
	}
}

// different than the one in the tool, this one can't rely on the output stream workaround
function filterFilePathFromCodeBlock2(source: AsyncIterable<LineOfText>): AsyncIterable<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		let index = -1;
		for await (const line of source) {
			index += 1;
			if (index === 0 && line.value.includes(filepathCodeBlockMarker)) {
				continue;
			}
			emitter.emitOne(line);
		}
	});
}

// @Yoyokrazy -- look at removing the following fn's as debt. newNb is likely not needed at minimum
export async function newNotebookCodeCell(instantiationService: IInstantiationService, chatMLFetcher: IChatMLFetcher, endpoint: IChatEndpoint, options: IConversationOptions, history: readonly Raw.ChatMessage[] | undefined, description: string, section: INotebookSection, existingCode: string, languageId: string, uri: Uri, token: CancellationToken) {
	const { messages } = await renderPromptElement(instantiationService, endpoint, NewNotebookCodeGenerationPrompt, {
		history,
		description,
		section,
		existingCode,
		languageId,
		uri
	});

	const modelResponse = await endpoint.makeChatRequest(
		'newNotebookCodeCell',
		messages,
		undefined,
		token,
		ChatLocation.Panel
	);
	if (modelResponse.type !== ChatFetchResponseType.Success) {
		return;
	}

	const codeBlocks = extractCodeBlocks(modelResponse.value);

	if (codeBlocks.length > 0) {
		return codeBlocks[0].code;
	}

	return modelResponse.value;
}

export async function improveNotebookCodeCell(instantiationService: IInstantiationService, chatMLFetcher: IChatMLFetcher, endpoint: IChatEndpoint, options: IConversationOptions, description: string, section: INotebookSection, existingCode: string, code: string, languageId: string, uri: Uri, token: CancellationToken) {

	const { messages } = await renderPromptElement(instantiationService, endpoint, NewNotebookCodeImprovementPrompt, {
		description,
		section,
		existingCode,
		code,
		languageId,
		uri
	});

	const modelResponse = await endpoint.makeChatRequest(
		'improveNotebookCodeCell',
		messages,
		undefined,
		token,
		ChatLocation.Panel
	);
	if (modelResponse.type !== ChatFetchResponseType.Success) {
		return;
	}

	return modelResponse.value;
}
