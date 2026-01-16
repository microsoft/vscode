/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, isCodeEditor, isCompositeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ModifiedFileEntryState } from '../../chat/common/editing/chatEditingService.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { CTX_INLINE_CHAT_HAS_AGENT2, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_POSSIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { askInPanelChat, IInlineChatSession2, IInlineChatSessionService } from './inlineChatSessionService.js';

export class InlineChatError extends Error {
	static readonly code = 'InlineChatError';
	constructor(message: string) {
		super(message);
		this.name = InlineChatError.code;
	}
}

export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _store = new DisposableStore();
	private readonly _sessions = new ResourceMap<IInlineChatSession2>();

	private readonly _onWillStartSession = this._store.add(new Emitter<IActiveCodeEditor>());
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _onDidChangeSessions = this._store.add(new Emitter<this>());
	readonly onDidChangeSessions: Event<this> = this._onDidChangeSessions.event;

	constructor(
		@IChatService private readonly _chatService: IChatService
	) { }

	dispose() {
		this._store.dispose();
	}


	createSession(editor: IActiveCodeEditor): IInlineChatSession2 {
		const uri = editor.getModel().uri;

		if (this._sessions.has(uri)) {
			throw new Error('Session already exists');
		}

		this._onWillStartSession.fire(editor);

		const chatModelRef = this._chatService.startSession(ChatAgentLocation.EditorInline, { canUseTools: false /* SEE https://github.com/microsoft/vscode/issues/279946 */ });
		const chatModel = chatModelRef.object;
		chatModel.startEditingSession(false);

		const store = new DisposableStore();
		store.add(toDisposable(() => {
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionResource);
			chatModel.editingSession?.reject();
			this._sessions.delete(uri);
			this._onDidChangeSessions.fire(this);
		}));
		store.add(chatModelRef);

		store.add(autorun(r => {

			const entries = chatModel.editingSession?.entries.read(r);
			if (!entries?.length) {
				return;
			}

			const state = entries.find(entry => isEqual(entry.modifiedURI, uri))?.state.read(r);
			if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
				const response = chatModel.getRequests().at(-1)?.response;
				if (response) {
					this._chatService.notifyUserAction({
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

		const result: IInlineChatSession2 = {
			uri,
			initialPosition: editor.getSelection().getStartPosition().delta(-1), /* one line above selection start */
			initialSelection: editor.getSelection(),
			chatModel,
			editingSession: chatModel.editingSession!,
			dispose: store.dispose.bind(store)
		};
		this._sessions.set(uri, result);
		this._onDidChangeSessions.fire(this);
		return result;
	}

	getSessionByTextModel(uri: URI): IInlineChatSession2 | undefined {
		let result = this._sessions.get(uri);
		if (!result) {
			// no direct session, try to find an editing session which has a file entry for the uri
			for (const [_, candidate] of this._sessions) {
				const entry = candidate.editingSession.getEntry(uri);
				if (entry) {
					result = candidate;
					break;
				}
			}
		}
		return result;
	}

	getSessionBySessionUri(sessionResource: URI): IInlineChatSession2 | undefined {
		for (const session of this._sessions.values()) {
			if (isEqual(session.chatModel.sessionResource, sessionResource)) {
				return session;
			}
		}
		return undefined;
	}
}

export class InlineChatEnabler {

	static Id = 'inlineChat.enabler';

	private readonly _ctxHasProvider2: IContextKey<boolean>;
	private readonly _ctxHasNotebookProvider: IContextKey<boolean>;
	private readonly _ctxPossible: IContextKey<boolean>;

	private readonly _store = new DisposableStore();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configService: IConfigurationService,
	) {
		this._ctxHasProvider2 = CTX_INLINE_CHAT_HAS_AGENT2.bindTo(contextKeyService);
		this._ctxHasNotebookProvider = CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService);
		this._ctxPossible = CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService);

		const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
		const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
		const notebookAgentConfigObs = observableConfigValue(InlineChatConfigKeys.notebookAgent, false, configService);

		this._store.add(autorun(r => {
			const agent = agentObs.read(r);
			if (!agent) {
				this._ctxHasProvider2.reset();
			} else {
				this._ctxHasProvider2.set(true);
			}
		}));

		this._store.add(autorun(r => {
			this._ctxHasNotebookProvider.set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
		}));

		const updateEditor = () => {
			const ctrl = editorService.activeEditorPane?.getControl();
			const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
			this._ctxPossible.set(isCodeEditorLike);
		};

		this._store.add(editorService.onDidActiveEditorChange(updateEditor));
		updateEditor();
	}

	dispose() {
		this._ctxPossible.reset();
		this._ctxHasProvider2.reset();
		this._store.dispose();
	}
}


export class InlineChatEscapeToolContribution extends Disposable {

	static readonly Id = 'inlineChat.escapeTool';

	static readonly DONT_ASK_AGAIN_KEY = 'inlineChat.dontAskMoveToPanelChat';

	private static readonly _data: IToolData = {
		id: 'inline_chat_exit',
		source: ToolDataSource.Internal,
		canBeReferencedInPrompt: false,
		alwaysDisplayInputOutput: false,
		displayName: localize('name', "Inline Chat to Panel Chat"),
		modelDescription: 'Moves the inline chat session to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.',
	};

	constructor(
		@ILanguageModelToolsService lmTools: ILanguageModelToolsService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@IDialogService dialogService: IDialogService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IChatService chatService: IChatService,
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instaService: IInstantiationService,
	) {

		super();

		this._store.add(lmTools.registerTool(InlineChatEscapeToolContribution._data, {
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

				const dontAskAgain = storageService.getBoolean(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, StorageScope.PROFILE);

				let result: { confirmed: boolean; checkboxChecked?: boolean };
				if (dontAskAgain !== undefined) {
					// Use previously stored user preference: true = 'Continue in Chat view', false = 'Rephrase' (Cancel)
					result = { confirmed: dontAskAgain, checkboxChecked: false };
				} else {
					result = await dialogService.confirm({
						type: 'question',
						title: localize('confirm.title', "Do you want to continue in Chat view?"),
						message: localize('confirm', "Do you want to continue in Chat view?"),
						detail: localize('confirm.detail', "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat."),
						primaryButton: localize('confirm.yes', "Continue in Chat view"),
						cancelButton: localize('confirm.cancel', "Cancel"),
						checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
					});
				}

				const editor = codeEditorService.getFocusedCodeEditor();

				if (!editor || result.confirmed) {
					logService.trace('InlineChatEscapeToolContribution: moving session to panel chat');
					await instaService.invokeFunction(askInPanelChat, session.chatModel.getRequests().at(-1)!, session.chatModel.inputModel.state.get());
					session.dispose();

				} else {
					logService.trace('InlineChatEscapeToolContribution: rephrase prompt');
					const lastRequest = session.chatModel.getRequests().at(-1)!;
					chatService.removeRequest(session.chatModel.sessionResource, lastRequest.id);
					session.chatModel.inputModel.setState({ inputText: lastRequest.message.text });
				}

				if (result.checkboxChecked) {
					storageService.store(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, result.confirmed, StorageScope.PROFILE, StorageTarget.USER);
					logService.trace('InlineChatEscapeToolContribution: stored don\'t ask again preference');
				}

				return { content: [{ kind: 'text', value: 'Success' }] };
			}
		}));
	}
}

registerAction2(class ResetMoveToPanelChatChoice extends Action2 {
	constructor() {
		super({
			id: 'inlineChat.resetMoveToPanelChatChoice',
			precondition: ChatContextKeys.Setup.hidden.negate(),
			title: localize2('resetChoice.label', "Reset Choice for 'Move Inline Chat to Panel Chat'"),
			f1: true
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IStorageService).remove(InlineChatEscapeToolContribution.DONT_ASK_AGAIN_KEY, StorageScope.PROFILE);
	}
});
