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
import { Schemas } from '../../../base/common/network.js';
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
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatWidgetService } from '../../contrib/chat/browser/chat.js';
import { AddDynamicVariableAction, IAddDynamicVariableContext } from '../../contrib/chat/browser/contrib/chatDynamicVariables.js';
import { IChatAgentHistoryEntry, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../contrib/chat/common/chatAgents.js';
import { ICustomAgentQueryOptions, IPromptsService } from '../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { IChatEditingService, IChatRelatedFileProviderMetadata } from '../../contrib/chat/common/chatEditingService.js';
import { IChatModel } from '../../contrib/chat/common/chatModel.js';
import { ChatRequestAgentPart } from '../../contrib/chat/common/chatParserTypes.js';
import { ChatRequestParser } from '../../contrib/chat/common/chatRequestParser.js';
import { IChatContentInlineReference, IChatContentReference, IChatFollowup, IChatNotebookEdit, IChatProgress, IChatService, IChatTask, IChatTaskSerialized, IChatWarningMessage } from '../../contrib/chat/common/chatService.js';
import { IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../contrib/chat/common/constants.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostChatAgentsShape2, ExtHostContext, IChatNotebookEditDto, IChatParticipantMetadata, IChatProgressDto, IDynamicChatAgentProps, IExtensionChatAgentMetadata, MainContext, MainThreadChatAgentsShape2 } from '../common/extHost.protocol.js';
import { NotebookDto } from './mainThreadNotebookDto.js';

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

	toJSON(): IChatTaskSerialized {
		return {
			kind: 'progressTaskSerialized',
			content: this.content,
			progress: this.progress
		};
	}
}

@extHostNamedCustomer(MainContext.MainThreadChatAgents2)
export class MainThreadChatAgents2 extends Disposable implements MainThreadChatAgentsShape2 {

	private readonly _agents = this._register(new DisposableMap<number, AgentData>());
	private readonly _agentCompletionProviders = this._register(new DisposableMap<number, IDisposable>());
	private readonly _agentIdsToCompletionProviders = this._register(new DisposableMap<string, IDisposable>);

	private readonly _chatParticipantDetectionProviders = this._register(new DisposableMap<number, IDisposable>());

	private readonly _chatRelatedFilesProviders = this._register(new DisposableMap<number, IDisposable>());

	private readonly _customAgentsProviders = this._register(new DisposableMap<number, IDisposable>());
	private readonly _customAgentsProviderEmitters = this._register(new DisposableMap<number, Emitter<void>>());

	private readonly _pendingProgress = new Map<string, { progress: (parts: IChatProgress[]) => void; chatSession: IChatModel | undefined }>();
	private readonly _proxy: ExtHostChatAgentsShape2;

	private readonly _activeTasks = new Map<string, IChatTask>();

	private readonly _unresolvedAnchors = new Map</* requestId */string, Map</* id */ string, IChatContentInlineReference>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatSessionsService private readonly _chatSessionService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IPromptsService private readonly _promptsService: IPromptsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);

		this._register(this._chatService.onDidDisposeSession(e => {
			this._proxy.$releaseSession(e.sessionResource);
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
		const model = widget?.viewModel?.model;
		if (!model) {
			this._logService.error(`MainThreadChat#$transferActiveChatSession: No active chat session found`);
			return;
		}

		const location = widget.location;
		this._chatService.transferChatSession({ sessionId: model.sessionId, inputState: model.inputModel.state.get(), location }, URI.revive(toWorkspace));
	}

	async $registerAgent(handle: number, extension: ExtensionIdentifier, id: string, metadata: IExtensionChatAgentMetadata, dynamicProps: IDynamicChatAgentProps | undefined): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const staticAgentRegistration = this._chatAgentService.getAgent(id, true);
		const chatSessionRegistration = this._chatSessionService.getAllChatSessionContributions().find(c => c.type === id || c.alternativeIds?.includes(id));
		if (!staticAgentRegistration && !chatSessionRegistration && !dynamicProps) {
			if (this._chatAgentService.getAgentsByName(id).length) {
				// Likely some extension authors will not adopt the new ID, so give a hint if they register a
				// participant by name instead of ID.
				throw new Error(`chatParticipant must be declared with an ID in package.json. The "id" property may be missing! "${id}"`);
			}

			throw new Error(`chatParticipant must be declared in package.json: ${id}`);
		}

		const impl: IChatAgentImplementation = {
			invoke: async (request, progress, history, token) => {
				const chatSession = this._chatService.getSession(request.sessionResource);
				this._pendingProgress.set(request.requestId, { progress, chatSession });
				try {
					return await this._proxy.$invokeAgent(handle, request, {
						history,
						chatSessionContext: chatSession?.contributedChatSession
					}, token) ?? {};
				} finally {
					this._pendingProgress.delete(request.requestId);
				}
			},
			setRequestTools: (requestId, tools) => {
				this._proxy.$setRequestTools(requestId, tools);
			},
			provideFollowups: async (request, result, history, token): Promise<IChatFollowup[]> => {
				if (!this._agents.get(handle)?.hasFollowups) {
					return [];
				}

				return this._proxy.$provideFollowups(request, handle, result, { history }, token);
			},
			provideChatTitle: (history, token) => {
				return this._proxy.$provideChatTitle(handle, history, token);
			},
			provideChatSummary: (history, token) => {
				return this._proxy.$provideChatSummary(handle, history, token);
			},
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
					extensionVersion: extensionDescription?.version,
					extensionDisplayName: extensionDescription?.displayName ?? extension.value,
					extensionPublisherId: extensionDescription?.publisher ?? '',
					publisherDisplayName: dynamicProps.publisherName,
					fullName: dynamicProps.fullName,
					metadata: revive(metadata),
					slashCommands: [],
					disambiguation: [],
					locations: [ChatAgentLocation.Chat],
					modes: [ChatModeKind.Ask, ChatModeKind.Agent, ChatModeKind.Edit],
				},
				impl);
		} else {
			disposable = this._chatAgentService.registerAgentImplementation(id, impl);
		}

		this._agents.set(handle, {
			id: id,
			extensionId: extension,
			dispose: () => disposable.dispose(),
			hasFollowups: metadata.hasFollowups
		});
	}

	async $updateAgent(handle: number, metadataUpdate: IExtensionChatAgentMetadata): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const data = this._agents.get(handle);
		if (!data) {
			this._logService.error(`MainThreadChatAgents2#$updateAgent: No agent with handle ${handle} registered`);
			return;
		}
		data.hasFollowups = metadataUpdate.hasFollowups;
		this._chatAgentService.updateAgent(data.id, revive(metadataUpdate));
	}

	async $handleProgressChunk(requestId: string, chunks: (IChatProgressDto | [IChatProgressDto, number])[]): Promise<void> {
		const pendingProgress = this._pendingProgress.get(requestId);
		if (!pendingProgress) {
			this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No pending progress for requestId ${requestId}`);
			return;
		}

		const { progress, chatSession } = pendingProgress;
		const chatProgressParts: IChatProgress[] = [];

		for (const item of chunks) {
			const [progress, responsePartHandle] = Array.isArray(item) ? item : [item];

			if (progress.kind === 'externalEdits') {
				// todo@connor4312: be more specific here, pass response model through to invocation?
				const response = chatSession?.getRequests().at(-1)?.response;
				if (chatSession?.editingSession && responsePartHandle !== undefined && response) {
					const parts = progress.start
						? await chatSession.editingSession.startExternalEdits(response, responsePartHandle, revive(progress.resources), progress.undoStopId)
						: await chatSession.editingSession.stopExternalEdits(response, responsePartHandle);
					chatProgressParts.push(...parts);
				}
				continue;
			}

			const revivedProgress = progress.kind === 'notebookEdit'
				? ChatNotebookEdit.fromChatEdit(progress)
				: revive(progress) as IChatProgress;

			if (revivedProgress.kind === 'notebookEdit'
				|| revivedProgress.kind === 'textEdit'
				|| revivedProgress.kind === 'codeblockUri'
			) {
				// make sure to use the canonical uri
				revivedProgress.uri = this._uriIdentityService.asCanonicalUri(revivedProgress.uri);
			}

			if (responsePartHandle !== undefined) {

				if (revivedProgress.kind === 'progressTask') {
					const handle = responsePartHandle;
					const responsePartId = `${requestId}_${handle}`;
					const task = new MainThreadChatTask(revivedProgress.content);
					this._activeTasks.set(responsePartId, task);
					chatProgressParts.push(task);
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
							break;
						case 'warning':
						case 'reference':
							task?.add(revivedProgress);
							break;
					}
				}
				continue;
			}

			if (revivedProgress.kind === 'inlineReference' && revivedProgress.resolveId) {
				if (!this._unresolvedAnchors.has(requestId)) {
					this._unresolvedAnchors.set(requestId, new Map());
				}
				this._unresolvedAnchors.get(requestId)?.set(revivedProgress.resolveId, revivedProgress);
			}

			chatProgressParts.push(revivedProgress);
		}

		progress(chatProgressParts);
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

		this._agentCompletionProviders.set(handle, this._languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
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

				const parsedRequest = this._instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionResource, model.getValue()).parts;
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
						command: { id: AddDynamicVariableAction.ID, title: '', arguments: [{ id: v.id, widget, range: rangeAfterInsert, variableData: revive(v.value), command: v.command } satisfies IAddDynamicVariableContext] }
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

	$registerRelatedFilesProvider(handle: number, metadata: IChatRelatedFileProviderMetadata): void {
		this._chatRelatedFilesProviders.set(handle, this._chatEditingService.registerRelatedFilesProvider(handle, {
			description: metadata.description,
			provideRelatedFiles: async (request, token) => {
				return (await this._proxy.$provideRelatedFiles(handle, request, token))?.map((v) => ({ uri: URI.from(v.uri), description: v.description })) ?? [];
			}
		}));
	}

	$unregisterRelatedFilesProvider(handle: number): void {
		this._chatRelatedFilesProviders.deleteAndDispose(handle);
	}

	async $registerCustomAgentsProvider(handle: number, extensionId: ExtensionIdentifier): Promise<void> {
		const extension = await this._extensionService.getExtension(extensionId.value);
		if (!extension) {
			this._logService.error(`[MainThreadChatAgents2] Could not find extension for CustomAgentsProvider: ${extensionId.value}`);
			return;
		}

		const emitter = new Emitter<void>();
		this._customAgentsProviderEmitters.set(handle, emitter);

		const disposable = this._promptsService.registerCustomAgentsProvider(extension, {
			onDidChangeCustomAgents: emitter.event,
			provideCustomAgents: async (options: ICustomAgentQueryOptions, token: CancellationToken) => {
				const agents = await this._proxy.$provideCustomAgents(handle, options, token);
				if (!agents) {
					return undefined;
				}
				// Convert UriComponents to URI
				return agents.map(agent => ({
					...agent,
					uri: URI.revive(agent.uri)
				}));
			}
		});

		this._customAgentsProviders.set(handle, disposable);
	}

	$unregisterCustomAgentsProvider(handle: number): void {
		this._customAgentsProviders.deleteAndDispose(handle);
		this._customAgentsProviderEmitters.deleteAndDispose(handle);
	}

	$onDidChangeCustomAgents(handle: number): void {
		const emitter = this._customAgentsProviderEmitters.get(handle);
		if (emitter) {
			emitter.fire();
		}
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

namespace ChatNotebookEdit {
	export function fromChatEdit(part: IChatNotebookEditDto): IChatNotebookEdit {
		return {
			kind: 'notebookEdit',
			uri: URI.revive(part.uri),
			done: part.done,
			edits: part.edits.map(NotebookDto.fromCellEditOperationDto)
		};
	}
}
