/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, dispose, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, isCodeEditor, isCompositeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { IChatEditReviewSession, IChatEditingService, ModifiedFileEntryState } from '../../chat/common/editing/chatEditingService.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_POSSIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { InlineChatEditReviewSession } from './inlineChatEditReviewSession.js';
import { IInlineChatSession, IInlineChatSessionService, InlineChatSessionTerminationState } from './inlineChatSessionService.js';
import { IInlineChatSessionResolver } from './inlineChatSessionResolver.js';

export class InlineChatError extends Error {
	static readonly code = 'InlineChatError';
	constructor(message: string) {
		super(message);
		this.name = InlineChatError.code;
	}
}

export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	readonly #store = new DisposableStore();
	readonly #sessions = new ResourceMap<IInlineChatSession>();

	readonly #onWillStartSession = this.#store.add(new Emitter<IActiveCodeEditor>());
	readonly onWillStartSession: Event<IActiveCodeEditor> = this.#onWillStartSession.event;

	readonly #onDidChangeSessions = this.#store.add(new Emitter<this>());
	readonly onDidChangeSessions: Event<this> = this.#onDidChangeSessions.event;

	readonly #chatService: IChatService;
	readonly #inlineChatSessionResolver: IInlineChatSessionResolver;
	readonly #instantiationService: IInstantiationService;
	readonly #chatEditingService: IChatEditingService;

	constructor(
		@IChatService chatService: IChatService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IInlineChatSessionResolver inlineChatSessionResolver: IInlineChatSessionResolver,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEditingService chatEditingService: IChatEditingService,
	) {
		this.#chatService = chatService;
		this.#inlineChatSessionResolver = inlineChatSessionResolver;
		this.#instantiationService = instantiationService;
		this.#chatEditingService = chatEditingService;
		// Listen for agent changes and dispose all sessions when there is no agent
		const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
		this.#store.add(autorun(r => {
			const agent = agentObs.read(r);
			if (!agent) {
				// No agent available, dispose all sessions
				dispose(this.#sessions.values());
				this.#sessions.clear();
			}
		}));
	}

	dispose() {
		this.#store.dispose();
	}


	async createSession(editor: IActiveCodeEditor, isNotebook: boolean, token: CancellationToken): Promise<IInlineChatSession> {
		const model = editor.getModel();
		const uri = model.uri;

		if (this.#sessions.has(uri)) {
			throw new Error('Session already exists');
		}

		this.#onWillStartSession.fire(editor);

		const isAgentHostEligible = uri.scheme === Schemas.file && !isNotebook;
		const resolution = isAgentHostEligible
			? await this.#inlineChatSessionResolver.resolve(token, model.getLanguageId(), uri)
			: undefined;
		if (token.isCancellationRequested || (isAgentHostEligible && !resolution)) {
			resolution?.modelRef.dispose();
			throw new CancellationError();
		}
		// Re-check after the await: a second controller for the same file (e.g. a split
		// editor) can pass the check above and resolve concurrently, and the loser would
		// otherwise overwrite the map entry the winner owns.
		if (this.#sessions.has(uri)) {
			resolution?.modelRef.dispose();
			throw new Error('Session already exists');
		}
		const chatModelRef = resolution?.modelRef ?? this.#chatService.startNewLocalSession(ChatAgentLocation.EditorInline, { canUseTools: false /* SEE https://github.com/microsoft/vscode/issues/279946 */ });
		const chatModel = chatModelRef.object;
		const lockToAgent = resolution?.lockToAgent;
		let reviewSession: InlineChatEditReviewSession | undefined;
		let editingSession: IChatEditReviewSession;
		if (lockToAgent) {
			reviewSession = this.#instantiationService.createInstance(InlineChatEditReviewSession, chatModel.sessionResource, uri);
			editingSession = reviewSession;
		} else {
			chatModel.startEditingSession(false);
			editingSession = chatModel.editingSession!;
		}
		const terminationState = observableValue<InlineChatSessionTerminationState | undefined>(this, undefined);

		const store = new DisposableStore();
		store.add(toDisposable(() => {
			void this.#chatService.cancelCurrentRequestForSession(chatModel.sessionResource, 'inlineChatSession');
			void editingSession.reject();
			this.#sessions.delete(uri);
			this.#onDidChangeSessions.fire(this);
		}));
		store.add(chatModelRef);
		if (reviewSession) {
			store.add(this.#chatEditingService.registerEditReviewSession(reviewSession));
			store.add(reviewSession);
			this.#installEditReviewObserver(chatModel, reviewSession, store);
		}

		store.add(autorun(r => {

			const entries = editingSession.entries.read(r);
			if (!entries?.length) {
				return;
			}

			const state = entries.find(entry => isEqual(entry.modifiedURI, uri))?.state.read(r);
			if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
				const response = chatModel.getRequests().at(-1)?.response;
				if (response) {
					this.#chatService.notifyUserAction({
						sessionResource: response.session.sessionResource,
						requestId: response.requestId,
						agentId: response.agent?.id,
						command: response.slashCommand?.name,
						result: response.result,
						action: {
							kind: 'inlineChat',
							action: state === ModifiedFileEntryState.Accepted ? 'accepted' : 'discarded'
						}
					});
				}
			}

			const allSettled = entries.every(entry => {
				const state = entry.state.read(r);
				return (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected)
					&& !entry.isCurrentlyBeingModifiedBy.read(r);
			});

			if (allSettled && !chatModel.requestInProgress.read(undefined)) {
				// self terminate
				store.dispose();
			}
		}));

		const result: IInlineChatSession = {
			uri,
			initialPosition: editor.getSelection().getStartPosition().delta(-1), /* one line above selection start */
			initialSelection: editor.getSelection(),
			chatModel,
			editingSession,
			lockToAgent,
			terminationState,
			setTerminationState: state => {
				terminationState.set(state, undefined);
				this.#onDidChangeSessions.fire(this);
			},
			dispose: store.dispose.bind(store)
		};
		this.#sessions.set(uri, result);
		this.#onDidChangeSessions.fire(this);
		return result;
	}

	#installEditReviewObserver(chatModel: IInlineChatSession['chatModel'], reviewSession: InlineChatEditReviewSession, store: DisposableStore): void {
		let turnQueue = Promise.resolve();
		let isDisposed = false;
		store.add(toDisposable(() => isDisposed = true));

		store.add(chatModel.onDidChange(async e => {
			if (e.kind !== 'addRequest' || !e.request.response) {
				return;
			}

			const response = e.request.response;
			const previousTurn = turnQueue;
			let completeTurn: (() => void) | undefined;
			turnQueue = new Promise<void>(resolve => completeTurn = resolve);

			await previousTurn;
			if (isDisposed) {
				completeTurn?.();
				return;
			}

			let beganTurn = false;
			try {
				await reviewSession.beginTurn(response);
				beganTurn = true;
				if (isDisposed) {
					return;
				}

				if (!response.isComplete) {
					const responseStore = new DisposableStore();
					try {
						await new Promise<void>(resolve => {
							responseStore.add(response.onDidChange(() => {
								if (response.isComplete) {
									resolve();
								}
							}));
							responseStore.add(reviewSession.onDidDispose(resolve));
							if (response.isComplete) {
								resolve();
							}
						});
					} finally {
						responseStore.dispose();
					}
				}
			} catch (error) {
				// Preparation failed, so the file is not locked and there is no review
				// baseline. Cancel the request rather than letting the agent write unguarded.
				if (!isDisposed) {
					void this.#chatService.cancelCurrentRequestForSession(chatModel.sessionResource, 'inlineChatBeginTurnFailed');
				}
				if (!isCancellationError(error)) {
					onUnexpectedError(error);
				}
			} finally {
				if (beganTurn && !isDisposed) {
					try {
						await reviewSession.endTurn(response);
					} catch (error) {
						onUnexpectedError(error);
					}
				}
				completeTurn?.();
			}
		}));
	}

	getSessionByTextModel(uri: URI): IInlineChatSession | undefined {
		let result = this.#sessions.get(uri);
		if (!result) {
			// no direct session, try to find an editing session which has a file entry for the uri
			for (const [_, candidate] of this.#sessions) {
				const entry = candidate.editingSession.getEntry(uri);
				if (entry) {
					result = candidate;
					break;
				}
			}
		}
		return result;
	}

	getSessionBySessionUri(sessionResource: URI): IInlineChatSession | undefined {
		for (const session of this.#sessions.values()) {
			if (isEqual(session.chatModel.sessionResource, sessionResource)) {
				return session;
			}
		}
		return undefined;
	}
}

export class InlineChatEnabler {

	static Id = 'inlineChat.enabler';

	readonly #ctxHasProvider: IContextKey<boolean>;
	readonly #ctxHasNotebookProvider: IContextKey<boolean>;
	readonly #ctxPossible: IContextKey<boolean>;

	readonly #store = new DisposableStore();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configService: IConfigurationService,
	) {
		this.#ctxHasProvider = CTX_INLINE_CHAT_HAS_AGENT.bindTo(contextKeyService);
		this.#ctxHasNotebookProvider = CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService);
		this.#ctxPossible = CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService);

		const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
		const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
		const notebookAgentConfigObs = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, configService);

		this.#store.add(autorun(r => {
			const agent = agentObs.read(r);
			if (!agent) {
				this.#ctxHasProvider.reset();
			} else {
				this.#ctxHasProvider.set(true);
			}
		}));

		this.#store.add(autorun(r => {
			this.#ctxHasNotebookProvider.set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
		}));

		const updateEditor = () => {
			const ctrl = editorService.activeEditorPane?.getControl();
			const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
			this.#ctxPossible.set(isCodeEditorLike);
		};

		this.#store.add(editorService.onDidActiveEditorChange(updateEditor));
		updateEditor();
	}

	dispose() {
		this.#ctxPossible.reset();
		this.#ctxHasProvider.reset();
		this.#store.dispose();
	}
}


export class InlineChatEscapeToolContribution extends Disposable {

	static readonly Id = 'inlineChat.escapeTool';
	static readonly #data: IToolData = {
		id: 'inline_chat_exit',
		source: ToolDataSource.Internal,
		canBeReferencedInPrompt: false,
		alwaysDisplayInputOutput: false,
		displayName: localize('name', "Inline Chat to Panel Chat"),
		modelDescription: 'Show a short textual response when not being able to make code changes and when not having been asked for code changes. Can also be used to move the request to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				response: {
					type: 'string',
					description: localize('response.description', "Optional brief response for inline chat. Keep it at 10 words or fewer."),
					maxLength: 200,
				}
			}
		}
	};

	constructor(
		@ILanguageModelToolsService lmTools: ILanguageModelToolsService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@ILogService logService: ILogService,
	) {

		super();

		this._store.add(lmTools.registerTool(InlineChatEscapeToolContribution.#data, {
			invoke: async (invocation, _tokenCountFn, _progress, _token) => {

				const sessionResource = invocation.context?.sessionResource;

				if (!sessionResource) {
					logService.warn('InlineChatEscapeToolContribution: no sessionId in tool invocation context');
					return { content: [{ kind: 'text', value: 'Cancel' }] };
				}

				const session = inlineChatSessionService.getSessionBySessionUri(sessionResource);

				if (!session) {
					logService.warn(`InlineChatEscapeToolContribution: no session found for id ${sessionResource}`);
					return { content: [{ kind: 'text', value: 'Cancel' }] };
				}

				const lastRequest = session.chatModel.getRequests().at(-1);
				if (!lastRequest) {
					logService.warn(`InlineChatEscapeToolContribution: no request found for id ${sessionResource}`);
					return { content: [{ kind: 'text', value: 'Cancel' }], toolResultMessage: localize('tool.cancel', "Cancel") };
				}

				const response = typeof invocation.parameters?.response === 'string' && invocation.parameters.response.trim().length > 0
					? invocation.parameters.response.trim()
					: localize('terminated.message', "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat.");

				session.setTerminationState(response);
				return { content: [{ kind: 'text', value: 'Success' }] };
			}
		}));
	}
}
