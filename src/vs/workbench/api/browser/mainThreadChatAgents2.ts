/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostChatAgentsShape2, ExtHostContext, IChatProgressDto, IExtensionChatAgentMetadata, MainContext, MainThreadChatAgentsShape2 } from 'vs/workbench/api/common/extHost.protocol';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { AddDynamicVariableAction, IAddDynamicVariableContext } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatFollowup, IChatProgress, IChatService, IChatTreeData } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

type AgentData = {
	dispose: () => void;
	name: string;
	hasSlashCommands?: boolean;
	hasFollowups?: boolean;
};

@extHostNamedCustomer(MainContext.MainThreadChatAgents2)
export class MainThreadChatAgents2 extends Disposable implements MainThreadChatAgentsShape2 {

	private readonly _agents = this._register(new DisposableMap<number, AgentData>());
	private readonly _agentCompletionProviders = this._register(new DisposableMap<number, IDisposable>());

	private readonly _pendingProgress = new Map<string, (part: IChatProgress) => void>();
	private readonly _proxy: ExtHostChatAgentsShape2;

	private _responsePartHandlePool = 0;
	private readonly _activeResponsePartPromises = new Map<string, DeferredPromise<string | IMarkdownString | IChatTreeData>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);

		this._register(this._chatService.onDidDisposeSession(e => {
			this._proxy.$releaseSession(e.sessionId);
		}));
		this._register(this._chatService.onDidPerformUserAction(e => {
			if (typeof e.agentId === 'string') {
				for (const [handle, agent] of this._agents) {
					if (agent.name === e.agentId) {
						if (e.action.kind === 'vote') {
							this._proxy.$acceptFeedback(handle, e.sessionId, e.requestId, e.action.direction);
						} else {
							this._proxy.$acceptAction(handle, e.sessionId, e.requestId, e);
						}
						break;
					}
				}
			}
		}));
	}

	$unregisterAgent(handle: number): void {
		this._agents.deleteAndDispose(handle);
	}

	$registerAgent(handle: number, name: string, metadata: IExtensionChatAgentMetadata): void {
		const d = this._chatAgentService.registerAgent({
			id: name,
			metadata: revive(metadata),
			invoke: async (request, progress, history, token) => {
				this._pendingProgress.set(request.requestId, progress);
				try {
					return await this._proxy.$invokeAgent(handle, request, { history }, token) ?? {};
				} finally {
					this._pendingProgress.delete(request.requestId);
				}
			},
			provideFollowups: async (sessionId, token): Promise<IChatFollowup[]> => {
				if (!this._agents.get(handle)?.hasFollowups) {
					return [];
				}

				return this._proxy.$provideFollowups(handle, sessionId, token);
			},
			provideSlashCommands: async (token) => {
				if (!this._agents.get(handle)?.hasSlashCommands) {
					return []; // save an IPC call
				}
				return this._proxy.$provideSlashCommands(handle, token);
			}
		});
		this._agents.set(handle, {
			name,
			dispose: d.dispose,
			hasSlashCommands: metadata.hasSlashCommands,
			hasFollowups: metadata.hasFollowups
		});
	}

	$updateAgent(handle: number, metadataUpdate: IExtensionChatAgentMetadata): void {
		const data = this._agents.get(handle);
		if (!data) {
			throw new Error(`No agent with handle ${handle} registered`);
		}
		data.hasSlashCommands = metadataUpdate.hasSlashCommands;
		data.hasFollowups = metadataUpdate.hasFollowups;
		this._chatAgentService.updateAgent(data.name, revive(metadataUpdate));
	}

	async $handleProgressChunk(requestId: string, progress: IChatProgressDto, responsePartHandle?: number): Promise<number | void> {
		if (progress.kind === 'asyncContent') {
			const handle = ++this._responsePartHandlePool;
			const responsePartId = `${requestId}_${handle}`;
			const deferredContentPromise = new DeferredPromise<string | IMarkdownString | IChatTreeData>();
			this._activeResponsePartPromises.set(responsePartId, deferredContentPromise);
			this._pendingProgress.get(requestId)?.({ ...progress, resolvedContent: deferredContentPromise.p });
			return handle;
		} else if (typeof responsePartHandle === 'number') {
			// Complete an existing deferred promise with resolved content
			const responsePartId = `${requestId}_${responsePartHandle}`;
			const deferredContentPromise = this._activeResponsePartPromises.get(responsePartId);
			if (deferredContentPromise && progress.kind === 'treeData') {
				const withRevivedUris = revive<IChatTreeData>(progress);
				deferredContentPromise.complete(withRevivedUris);
				this._activeResponsePartPromises.delete(responsePartId);
			} else if (deferredContentPromise && progress.kind === 'content') {
				deferredContentPromise.complete(progress.content);
				this._activeResponsePartPromises.delete(responsePartId);
			}
			return responsePartHandle;
		}

		const revivedProgress = revive(progress);
		this._pendingProgress.get(requestId)?.(revivedProgress as IChatProgress);
	}

	$registerAgentCompletionsProvider(handle: number, triggerCharacters: string[]): void {
		this._agentCompletionProviders.set(handle, this._languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentCompletions:' + handle,
			triggerCharacters,
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return;
				}

				const triggerCharsPart = triggerCharacters.map(c => escapeRegExpCharacters(c)).join('');
				const wordRegex = new RegExp(`[${triggerCharsPart}]\\S*`, 'g');
				const query = getWordAtText(position.column, wordRegex, model.getLineContent(position.lineNumber), 0)?.word ?? '';

				if (query && !triggerCharacters.some(c => query.startsWith(c))) {
					return;
				}

				const parsedRequest = (await this._instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionId, model.getValue())).parts;
				const agentPart = parsedRequest.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
				const thisAgentName = this._agents.get(handle)?.name;
				if (agentPart?.agent.id !== thisAgentName) {
					return;
				}

				const range = computeCompletionRanges(model, position, wordRegex);
				if (!range) {
					return null;
				}

				const result = await this._proxy.$invokeCompletionProvider(handle, query, token);
				const variableItems = result.map(v => {
					const insertText = v.insertText ?? (typeof v.label === 'string' ? v.label : v.label.label);
					const rangeAfterInsert = new Range(range.insert.startLineNumber, range.insert.startColumn, range.insert.endLineNumber, range.insert.startColumn + insertText.length);
					return {
						label: v.label,
						range,
						insertText: insertText + ' ',
						kind: CompletionItemKind.Text,
						detail: v.detail,
						documentation: v.documentation,
						command: { id: AddDynamicVariableAction.ID, title: '', arguments: [{ widget, range: rangeAfterInsert, variableData: revive(v.values) } satisfies IAddDynamicVariableContext] }
					} satisfies CompletionItem;
				});

				return {
					suggestions: variableItems
				} satisfies CompletionList;
			}
		}));
	}

	$unregisterAgentCompletionsProvider(handle: number): void {
		this._agentCompletionProviders.deleteAndDispose(handle);
	}
}


function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp): { insert: Range; replace: Range } | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace };
}
