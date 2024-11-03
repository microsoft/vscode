/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { Position } from '../../../editor/common/core/position.js';
import { Range } from '../../../editor/common/core/range.js';
import { getWordAtText } from '../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../editor/common/languages.js';
import { ITextModel } from '../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatWidgetService } from '../../contrib/chat/browser/chat.js';
import { ChatInputPart } from '../../contrib/chat/browser/chatInputPart.js';
import { AddDynamicVariableAction, IAddDynamicVariableContext } from '../../contrib/chat/browser/contrib/chatDynamicVariables.js';
import { ChatAgentLocation, IChatAgentHistoryEntry, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../contrib/chat/common/chatAgents.js';
import { ChatRequestAgentPart } from '../../contrib/chat/common/chatParserTypes.js';
import { ChatRequestParser } from '../../contrib/chat/common/chatRequestParser.js';
import { IChatContentInlineReference, IChatContentReference, IChatFollowup, IChatProgress, IChatService, IChatTask, IChatWarningMessage } from '../../contrib/chat/common/chatService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostChatAgentsShape2, ExtHostContext, IChatParticipantMetadata, IChatProgressDto, IDynamicChatAgentProps, IExtensionChatAgentMetadata, MainContext, MainThreadChatAgentsShape2 } from '../common/extHost.protocol.js';

interface AgentData {
	dispose: () => void;
	id: string;
	extensionId: ExtensionIdentifier;
	hasFollowups?: boolean;
}

export class MainThreadChatTask implements IChatTask {
	public readonly kind = 'progressTask';

	public readonly deferred = new DeferredPromise<string | void>();

	private readonly _onDidAddProgress = new Emitter<IChatWarningMessage | IChatContentReference>();
	public get onDidAddProgress(): Event<IChatWarningMessage | IChatContentReference> { return this._onDidAddProgress.event; }

	public readonly progress: (IChatWarningMessage | IChatContentReference)[] = [];

	constructor(public content: IMarkdownString) { }

	task() {
		return this.deferred.p;
	}

	isSettled() {
		return this.deferred.isSettled;
	}

	complete(v: string | void) {
		this.deferred.complete(v);
	}

	add(progress: IChatWarningMessage | IChatContentReference): void {
		this.progress.push(progress);
		this._onDidAddProgress.fire(progress);
	}
}

@extHostNamedCustomer(MainContext.MainThreadChatAgents2)
export class MainThreadChatAgents2 extends Disposable implements MainThreadChatAgentsShape2 {

	private readonly _agents = this._register(new DisposableMap<number, AgentData>());
	private readonly _agentCompletionProviders = this._register(new DisposableMap<number, IDisposable>());
	private readonly _agentIdsToCompletionProviders = this._register(new DisposableMap<string, IDisposable>);

	private readonly _chatParticipantDetectionProviders = this._register(new DisposableMap<number, IDisposable>());

	private readonly _pendingProgress = new Map<string, (part: IChatProgress) => void>();
	private readonly _proxy: ExtHostChatAgentsShape2;

	private _responsePartHandlePool = 0;
	private readonly _activeTasks = new Map<string, IChatTask>();

	private readonly _unresolvedAnchors = new Map</* requestId */string, Map</* id */ string, IChatContentInlineReference>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);

		this._register(this._chatService.onDidDisposeSession(e => {
			this._proxy.$releaseSession(e.sessionId);
		}));
		this._register(this._chatService.onDidPerformUserAction(e => {
			if (typeof e.agentId === 'string') {
				for (const [handle, agent] of this._agents) {
					if (agent.id === e.agentId) {
						if (e.action.kind === 'vote') {
							this._proxy.$acceptFeedback(handle, e.result ?? {}, e.action);
						} else {
							this._proxy.$acceptAction(handle, e.result || {}, e);
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

	$transferActiveChatSession(toWorkspace: UriComponents): void {
		const widget = this._chatWidgetService.lastFocusedWidget;
		const sessionId = widget?.viewModel?.model.sessionId;
		if (!sessionId) {
			this._logService.error(`MainThreadChat#$transferActiveChatSession: No active chat session found`);
			return;
		}

		const inputValue = widget?.inputEditor.getValue() ?? '';
		this._chatService.transferChatSession({ sessionId, inputValue }, URI.revive(toWorkspace));
	}

	$registerAgent(handle: number, extension: ExtensionIdentifier, id: string, metadata: IExtensionChatAgentMetadata, dynamicProps: IDynamicChatAgentProps | undefined): void {
		const staticAgentRegistration = this._chatAgentService.getAgent(id, true);
		if (!staticAgentRegistration && !dynamicProps) {
			if (this._chatAgentService.getAgentsByName(id).length) {
				// Likely some extension authors will not adopt the new ID, so give a hint if they register a
				// participant by name instead of ID.
				throw new Error(`chatParticipant must be declared with an ID in package.json. The "id" property may be missing! "${id}"`);
			}

			throw new Error(`chatParticipant must be declared in package.json: ${id}`);
		}

		const impl: IChatAgentImplementation = {
			invoke: async (request, progress, history, token) => {
				this._pendingProgress.set(request.requestId, progress);
				try {
					return await this._proxy.$invokeAgent(handle, request, { history }, token) ?? {};
				} finally {
					this._pendingProgress.delete(request.requestId);
				}
			},
			provideFollowups: async (request, result, history, token): Promise<IChatFollowup[]> => {
				if (!this._agents.get(handle)?.hasFollowups) {
					return [];
				}

				return this._proxy.$provideFollowups(request, handle, result, { history }, token);
			},
			provideWelcomeMessage: (token: CancellationToken) => {
				return this._proxy.$provideWelcomeMessage(handle, token);
			},
			provideChatTitle: (history, token) => {
				return this._proxy.$provideChatTitle(handle, history, token);
			},
			provideSampleQuestions: (location: ChatAgentLocation, token: CancellationToken) => {
				return this._proxy.$provideSampleQuestions(handle, location, token);
			}
		};

		let disposable: IDisposable;
		if (!staticAgentRegistration && dynamicProps) {
			const extensionDescription = this._extensionService.extensions.find(e => ExtensionIdentifier.equals(e.identifier, extension));
			disposable = this._chatAgentService.registerDynamicAgent(
				{
					id,
					name: dynamicProps.name,
					description: dynamicProps.description,
					extensionId: extension,
					extensionDisplayName: extensionDescription?.displayName ?? extension.value,
					extensionPublisherId: extensionDescription?.publisher ?? '',
					publisherDisplayName: dynamicProps.publisherName,
					fullName: dynamicProps.fullName,
					metadata: revive(metadata),
					slashCommands: [],
					disambiguation: [],
					locations: [ChatAgentLocation.Panel], // TODO all dynamic participants are panel only?
				},
				impl);
		} else {
			disposable = this._chatAgentService.registerAgentImplementation(id, impl);
		}

		this._agents.set(handle, {
			id: id,
			extensionId: extension,
			dispose: disposable.dispose,
			hasFollowups: metadata.hasFollowups
		});
	}

	$updateAgent(handle: number, metadataUpdate: IExtensionChatAgentMetadata): void {
		const data = this._agents.get(handle);
		if (!data) {
			this._logService.error(`MainThreadChatAgents2#$updateAgent: No agent with handle ${handle} registered`);
			return;
		}
		data.hasFollowups = metadataUpdate.hasFollowups;
		this._chatAgentService.updateAgent(data.id, revive(metadataUpdate));
	}

	async $handleProgressChunk(requestId: string, progress: IChatProgressDto, responsePartHandle?: number): Promise<number | void> {
		const revivedProgress = revive(progress) as IChatProgress;
		if (revivedProgress.kind === 'progressTask') {
			const handle = ++this._responsePartHandlePool;
			const responsePartId = `${requestId}_${handle}`;
			const task = new MainThreadChatTask(revivedProgress.content);
			this._activeTasks.set(responsePartId, task);
			this._pendingProgress.get(requestId)?.(task);
			return handle;
		} else if (responsePartHandle !== undefined) {
			const responsePartId = `${requestId}_${responsePartHandle}`;
			const task = this._activeTasks.get(responsePartId);
			switch (revivedProgress.kind) {
				case 'progressTaskResult':
					if (task && revivedProgress.content) {
						task.complete(revivedProgress.content.value);
						this._activeTasks.delete(responsePartId);
					} else {
						task?.complete(undefined);
					}
					return responsePartHandle;
				case 'warning':
				case 'reference':
					task?.add(revivedProgress);
					return;
			}
		}

		if (revivedProgress.kind === 'inlineReference' && revivedProgress.resolveId) {
			if (!this._unresolvedAnchors.has(requestId)) {
				this._unresolvedAnchors.set(requestId, new Map());
			}
			this._unresolvedAnchors.get(requestId)?.set(revivedProgress.resolveId, revivedProgress);
		}

		this._pendingProgress.get(requestId)?.(revivedProgress);
	}

	$handleAnchorResolve(requestId: string, handle: string, resolveAnchor: Dto<IChatContentInlineReference> | undefined): void {
		const anchor = this._unresolvedAnchors.get(requestId)?.get(handle);
		if (!anchor) {
			return;
		}

		this._unresolvedAnchors.get(requestId)?.delete(handle);
		if (resolveAnchor) {
			const revivedAnchor = revive(resolveAnchor) as IChatContentInlineReference;
			anchor.inlineReference = revivedAnchor.inlineReference;
		}
	}

	$registerAgentCompletionsProvider(handle: number, id: string, triggerCharacters: string[]): void {
		const provide = async (query: string, token: CancellationToken) => {
			const completions = await this._proxy.$invokeCompletionProvider(handle, query, token);
			return completions.map((c) => ({ ...c, icon: c.icon ? ThemeIcon.fromId(c.icon) : undefined }));
		};
		this._agentIdsToCompletionProviders.set(id, this._chatAgentService.registerAgentCompletionProvider(id, provide));

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

				const parsedRequest = this._instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionId, model.getValue()).parts;
				const agentPart = parsedRequest.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
				const thisAgentId = this._agents.get(handle)?.id;
				if (agentPart?.agent.id !== thisAgentId) {
					return;
				}

				const range = computeCompletionRanges(model, position, wordRegex);
				if (!range) {
					return null;
				}

				const result = await provide(query, token);
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
						command: { id: AddDynamicVariableAction.ID, title: '', arguments: [{ id: v.id, widget, range: rangeAfterInsert, variableData: revive(v.value) as any, command: v.command } satisfies IAddDynamicVariableContext] }
					} satisfies CompletionItem;
				});

				return {
					suggestions: variableItems
				} satisfies CompletionList;
			}
		}));
	}

	$unregisterAgentCompletionsProvider(handle: number, id: string): void {
		this._agentCompletionProviders.deleteAndDispose(handle);
		this._agentIdsToCompletionProviders.deleteAndDispose(id);
	}

	$registerChatParticipantDetectionProvider(handle: number): void {
		this._chatParticipantDetectionProviders.set(handle, this._chatAgentService.registerChatParticipantDetectionProvider(handle,
			{
				provideParticipantDetection: async (request: IChatAgentRequest, history: IChatAgentHistoryEntry[], options: { location: ChatAgentLocation; participants: IChatParticipantMetadata[] }, token: CancellationToken) => {
					return await this._proxy.$detectChatParticipant(handle, request, { history }, options, token);
				}
			}
		));
	}

	$unregisterChatParticipantDetectionProvider(handle: number): void {
		this._chatParticipantDetectionProviders.deleteAndDispose(handle);
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
