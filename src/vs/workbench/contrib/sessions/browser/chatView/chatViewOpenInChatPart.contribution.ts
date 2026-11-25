/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, runOnChange, waitForState } from '../../../../../base/common/observable.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { extUri, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ActiveAuxiliaryContext } from '../../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { localChatSessionType } from '../../../chat/common/chatSessionsService.js';
import { getChatSessionType, isUntitledChatSession } from '../../../chat/common/model/chatUri.js';
import { ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { IEditorWindowShownChatService } from '../agentsView/editorWindowMainSessionHost.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatViewSessionsOpenChatIn } from '../../../chat/common/constants.js';
import { ILocalChatAvailabilityService } from '../../../chat/common/localChatAvailability.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { AgentsViewAvailable } from '../agentsView/agentsChatPartContext.js';
import { IEditorWindowChatPartService } from '../agentsView/agentsChatPartContribution.js';
import { IEditorWindowPresentedChat, IEditorWindowPresenterOpenOptions, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../editorWindow/editorWindowSessionsPresenter.js';
import { shouldRevealSessionEditor } from '../../../chat/browser/agentSessions/agentSessionsOpener.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { ChatEditorInput } from '../../../chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ShownChatReadMarker } from '../shownChatReadMarker.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.ChatViewSessionsOpenChatIn]: {
			type: 'string',
			enum: [ChatViewSessionsOpenChatIn.ChatPanel, ChatViewSessionsOpenChatIn.ChatArea, ChatViewSessionsOpenChatIn.EditorArea],
			enumDescriptions: [
				localize('chat.viewSessions.openChatIn.chatPanel', "Open the chat of a session in the Chat view."),
				localize('chat.viewSessions.openChatIn.chatArea', "Open the chat of a session in the chat area beside the Chat view, which then shows only its sessions. Applies while {0} is `sideBySide`.", '`#chat.viewSessions.orientation#`'),
				localize('chat.viewSessions.openChatIn.editorArea', "Open the chat of a session as an editor in the editor area, also from a session link. A chat that is already open is revealed instead of opened again."),
			],
			default: ChatViewSessionsOpenChatIn.ChatPanel,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.openChatIn', "Controls where the chat of a session opens when it is selected in the sessions of the Chat view."),
		},
	},
});

/** The input of a new chat that moves, and the widget it was taken from (`source`), with the chat it showed (`sourceResource`). */
type ChatDraftHandover = { readonly kind: 'draft'; readonly source: IChatWidget | undefined; readonly sourceResource: URI | undefined; readonly input: string; readonly attachments: readonly IChatRequestVariableEntry[] };

/**
 * What moves to the other host as the chat part turns on or off: a session, a new chat with the input of the one it took
 * (`draft`), or a new chat (`none`). A local chat of the Chat view (`local`) leaves it for a new chat of the chat part
 * (`then`) only while local chats are hidden.
 */
type ChatHandover =
	| { readonly kind: 'session'; readonly resource: URI }
	| ChatDraftHandover
	| { readonly kind: 'none' }
	| { readonly kind: 'local'; readonly then: ChatDraftHandover };

/** The chat part docks beside the Chat view: the Agents viewlet docks it beside its own view, over this. */
const CHAT_VIEW_ANCHOR_PRIORITY = 1;

/** Shows the chats of sessions as editors in the editor area, while the setting is `editorArea`; an open one is revealed. */
class EditorAreaSessionsPresenter implements IEditorWindowSessionsPresenter {

	constructor(
		readonly activeChat: IObservable<IEditorWindowPresentedChat | undefined>,
		private readonly _chatWidgetService: IChatWidgetService,
		private readonly _chatViewHostService: IChatViewHostService,
		private readonly _editorService: IEditorService,
	) { }

	async openChat(session: ISession, chatResource: URI | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		const resource = chatResource ?? session.mainChat.get().resource;
		await this._chatWidgetService.openSession(resource, options?.sideBySide ? SIDE_GROUP : ACTIVE_GROUP, { preserveFocus: options?.preserveFocus, revealIfOpened: !options?.sideBySide && shouldRevealSessionEditor(this._chatWidgetService, resource) });
	}

	async openComposer(target: INewSessionTarget | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		const aimed = target && { folder: target.folderUri, providerId: target.providerId, sessionType: target.sessionTypeId, modelId: target.modelId, modeId: target.modeId, requireDevContainer: target.requireDevContainer };
		await this._chatViewHostService.newChat(aimed, { ownChat: true, preserveFocus: options?.preserveFocus });
	}

	async closeChat(chatResource: URI): Promise<void> {
		await this._editorService.closeEditors(this._editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor instanceof ChatEditorInput && isEqual(editor.sessionResource, chatResource)));
	}

	isShowing(chatResource: URI): boolean {
		return this._editorService.getEditors(EditorsOrder.SEQUENTIAL).some(({ editor }) => editor instanceof ChatEditorInput && isEqual(editor.sessionResource, chatResource));
	}

	focus(): void {
		void this._chatViewHostService.reveal(false);
	}
}

/**
 * Opens the chats of agent sessions in the chat part beside the Chat view while {@link ChatConfiguration.ChatViewSessionsOpenChatIn}
 * is `chatArea` and the configured sessions orientation is side by side (not the width-based layout),
 * in local editor windows: what would show a chat in the Chat view, such as opening a session or New Chat, shows it in
 * the chat part, as the Agents viewlet does, and the Chat view shows only its sessions. While it is off, the chat part does not
 * show and the Chat view is unchanged.
 */
export class ChatViewOpenInChatPartContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewOpenInChatPart';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IEditorWindowChatPartService private readonly _chatPartService: IEditorWindowChatPartService,
		@IEditorWindowSessionsRuntime sessionsRuntime: IEditorWindowSessionsRuntime,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@ILocalChatAvailabilityService private readonly _localChatAvailabilityService: ILocalChatAvailabilityService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IEditorWindowShownChatService private readonly _shownChatService: IEditorWindowShownChatService,
		@IEditorService private readonly _editorService: IEditorService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IEditorWindowSessionsPresenterService presenterService: IEditorWindowSessionsPresenterService,
	) {
		super();

		if (environmentService.remoteAuthority || environmentService.isSessionsWindow) {
			return;
		}

		const openChatIn = observableConfigValue<string>(ChatConfiguration.ChatViewSessionsOpenChatIn, ChatViewSessionsOpenChatIn.ChatPanel, configurationService);
		const orientation = observableConfigValue<unknown>(ChatConfiguration.ChatViewSessionsOrientation, 'sideBySide', configurationService);
		// What the chat part's host needs to show chats: not with AI features disabled, nor with agents disabled
		const available = ContextKeyExpr.and(ChatContextKeys.enabled, AgentsViewAvailable)!;
		const availableKeys = new Set(available.keys());
		const chatAvailable = observableFromEvent(this, Event.filter(_contextKeyService.onDidChangeContext, e => e.affectsSome(availableKeys)), () => _contextKeyService.contextMatchesRules(available));
		// As configured: its setting, with the sessions side by side (not the width-based layout)
		const configured = derived(this, reader => openChatIn.read(reader) === ChatViewSessionsOpenChatIn.ChatArea && orientation.read(reader) !== 'stacked');
		const enabled = derived(this, reader => configured.read(reader) && chatAvailable.read(reader));
		// The chat of the active chat editor, with its session
		const activeEditor = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSession);
		const editorChat = derived(this, reader => {
			const editor = activeEditor.read(reader);
			const resource = editor instanceof ChatEditorInput ? editor.sessionResource : undefined;
			sessionsChanged.read(reader);
			return resource && this._sessionsManagementService.getSessionForChatResource(resource);
		});
		this._register(autorun(reader => {
			// Not over the presenter of the chat part, which the Agents viewlet enables: its chats open there
			if (openChatIn.read(reader) === ChatViewSessionsOpenChatIn.EditorArea && chatAvailable.read(reader) && !this._chatPartService.enabled.read(reader)) {
				reader.store.add(presenterService.registerPresenter(new EditorAreaSessionsPresenter(editorChat, this._chatWidgetService, this._chatViewHostService, this._editorService)));
				// The window shows the chat of the active chat editor, in place of the chat of the Chat view while there is one
				const shown = derived(this, reader => {
					const chat = editorChat.read(reader);
					if (chat) {
						return chat;
					}
					const shownSession = this._chatViewHostService.shownSession.read(reader);
					sessionsChanged.read(reader);
					return shownSession && this._sessionsManagementService.getSessionForChatResource(shownSession.resource);
				});
				reader.store.add(this._shownChatService.bind(shown, { override: true, priority: 1 }));
				// The chat that the first request of the Chat view's new chat commits moves to an editor that stays open, also of a new chat
				// revealed before its request, such as by Run Prompt in New Chat
				reader.store.add(runOnChange(this._chatViewHostService.shownSession, shownSession => {
					if (shownSession?.reason === 'commit' && !isUntitledChatSession(shownSession.resource) && this._chatViewHostService.chatViewHosts.read(undefined)) {
						this._chatWidgetService.openSession(shownSession.resource, ACTIVE_GROUP, { pinned: true }).catch(onUnexpectedError);
					}
				}));
				// A chat that shows in an editor is read, as one that shows in the Chat view is
				const readMarker = new ShownChatReadMarker(this._sessionsManagementService, extUri);
				reader.store.add(autorun(reader => {
					const chat = editorChat.read(reader);
					if (chat) {
						readMarker.update(chat.session, chat.chat, reader);
					} else {
						readMarker.reset();
					}
				}));
			}
		}));
		this._register(this._chatPartService.enable({ anchorViewId: ChatViewId, anchorPriority: CHAT_VIEW_ANCHOR_PRIORITY, enabled }));
		// The sessions that the chat part shows are known while the Chat view lists them
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(sessionsRuntime.enable({ viewIds: [ChatViewId] }));
			}
		}));
		// The chats show in the chat part or in editors, so the Chat view shows only its sessions, except while it hosts a chat that the
		// chat part leaves to it, such as a local chat: the seam owns that rule.
		const sessionsOnly = derived(this, reader => {
			const setting = openChatIn.read(reader);
			return (setting === ChatViewSessionsOpenChatIn.ChatArea || setting === ChatViewSessionsOpenChatIn.EditorArea) && orientation.read(reader) !== 'stacked' && chatAvailable.read(reader);
		});
		this._register(autorun(reader => {
			if (sessionsOnly.read(reader)) {
				reader.store.add(this._chatViewHostService.register({ chatsOpenElsewhere: true }));
				// No local chats, which the chat part and editors of sessions do not show: as with the sessions list of the Chat view, whose chats are those of sessions
				reader.store.add(this._localChatAvailabilityService.hide());
			}
		}));

		// What the Chat view showed until chats opened in the chat part: as they do, the chat part's host shows what opens
		let chatViewShown: URI | undefined;
		this._register(autorun(reader => {
			if (!enabled.read(reader)) {
				chatViewShown = this._chatViewHostService.shownSession.read(reader)?.resource;
			}
		}));
		// As it is configured on or off while the window runs, the chat shown moves to the other host: not as the window starts,
		// which restores each, nor as chat itself comes or goes
		const handover = this._register(new MutableDisposable());
		this._register(runOnChange(configured, toChatPart => {
			if (!this._contextKeyService.contextMatchesRules(available)) {
				return;
			}
			const taken = toChatPart ? this._takeFromChatView(chatViewShown) : this._takeFromChatPart();
			// A later move supersedes this one
			const cts = new CancellationTokenSource();
			handover.value = toDisposable(() => cts.dispose(true));
			this._handOver(taken, toChatPart, cts.token).catch(error => {
				if (!isCancellationError(error)) {
					onUnexpectedError(error);
				}
			});
		}));
		this._hideMaximizeWhileSessionsOnly();
	}

	/**
	 * What the Chat view shows, to show in the chat part: its session, or the input of its new chat. A local chat, which the
	 * chat part does not show, gives way to a new chat of the chat part, which takes the input typed in it.
	 */
	private _takeFromChatView(resource: URI | undefined): ChatHandover {
		if (!resource) {
			return { kind: 'none' };
		}
		if (getChatSessionType(resource) === localChatSessionType) {
			return { kind: 'local', then: this._takeDraft(this._chatWidgetService.getWidgetBySessionResource(resource)) };
		}
		return isUntitledChatSession(resource) ? this._takeDraft(this._chatWidgetService.getWidgetBySessionResource(resource)) : { kind: 'session', resource };
	}

	/** What the chat part shows, to show in the Chat view: its session, or the input of its new session. */
	private _takeFromChatPart(): ChatHandover {
		const shown = this._shownChatService.shown.get();
		if (!shown) {
			return { kind: 'none' };
		}
		return isSessionCreated(shown.session) ? { kind: 'session', resource: shown.chat.resource } : this._takeDraft(this._chatWidgetService.getWidgetBySessionResource(shown.chat.resource));
	}

	private _takeDraft(widget: IChatWidget | undefined): ChatDraftHandover {
		return { kind: 'draft', source: widget, sourceResource: widget?.viewModel?.sessionResource, input: widget?.getInput() ?? '', attachments: [...widget?.attachmentModel.attachments ?? []] };
	}

	/**
	 * Shows what `handover` took in the other host, once that host is in use: its session, unless it shows it already, which
	 * a session taken from the chat part then leaves once the Chat view shows it; else a new chat there, with the input it
	 * took, which leaves its source only once the new chat holds it. Never in the host it took it from, nor after a later
	 * request, such as an open by the user; over the input of the new chat only as the chat part's composer parks it. A local chat leaves the Chat view only while local
	 * chats are hidden: the chat part's new chat then takes the Chat view, which shows only its sessions, and the local chat
	 * stays in its history.
	 */
	private async _handOver(handover: ChatHandover, toChatPart: boolean, token: CancellationToken): Promise<void> {
		await waitForState(this._chatViewHostService.replaced, replaced => replaced === toChatPart, undefined, token);
		if (token.isCancellationRequested) {
			return;
		}
		if (handover.kind === 'local') {
			if (!this._localChatAvailabilityService.hidden.get()) {
				return;
			}
			handover = handover.then;
		}
		if (handover.kind === 'session') {
			// The seam shows what the host in use shows: the target's
			if (!isEqual(this._chatViewHostService.shownSession.get()?.resource, handover.resource)) {
				await this._chatViewHostService.openSession(handover.resource, { preserveFocus: true });
			}
			// The chat part keeps its other chats, for as it turns on again, but not the one the Chat view shows now: only once
			// it does, not when it failed to open it, or a later request showed another chat
			if (!toChatPart && !token.isCancellationRequested && this._chatViewHostService.chatViewHosts.get() && isEqual(this._chatViewHostService.shownSession.get()?.resource, handover.resource)) {
				await this._chatPartService.closeChat(handover.resource);
			}
			return;
		}
		// What the user asks for meanwhile, such as an open, supersedes the move: the new chat it starts is the only request
		let requests = this._chatViewHostService.requests.get() + 1;
		// Only the chat part's own new chat as it turns on, never the Chat view's in its place; the Chat view's own as it turns off
		if (!await this._chatViewHostService.newChat(undefined, { ownChat: !toChatPart, preserveFocus: true }) || token.isCancellationRequested || this._chatViewHostService.requests.get() !== requests) {
			return;
		}
		if (handover.kind !== 'draft' || (!handover.input && !handover.attachments.length)) {
			return;
		}
		requests++;
		const target = await this._chatViewHostService.reveal(true);
		if (!target || target === handover.source || token.isCancellationRequested || this._chatViewHostService.requests.get() !== requests || !this._isUnchanged(handover)) {
			return;
		}
		if (target.getInput() || target.attachmentModel.attachments.length) {
			// The chat part's one unsent composer, with a draft typed before the chat part turned off: the newer one, typed in the
			// Chat view since, takes it, and the composer keeps the older one for its next new chat
			if (!toChatPart || !this._chatPartService.parkComposerInput()) {
				return;
			}
		}
		target.setInput(handover.input);
		target.attachmentModel.clearAndSetContext(...handover.attachments);
		handover.source?.setInput('');
		handover.source?.attachmentModel.clear();
	}

	/**
	 * Whether the source of `handover` still shows what it took: not once it shows another chat, or its text or attachments
	 * changed, such as an attachment that resolved meanwhile. It keeps its input then.
	 */
	private _isUnchanged(handover: ChatDraftHandover): boolean {
		const source = handover.source;
		if (!source) {
			return true;
		}
		const attachments = source.attachmentModel.attachments;
		return isEqual(source.viewModel?.sessionResource, handover.sourceResource) && source.getInput() === handover.input
			&& attachments.length === handover.attachments.length && attachments.every((attachment, index) => attachment === handover.attachments[index]);
	}

	/**
	 * While the Chat view shows only its sessions, as its sessions list says, the secondary side bar does not offer to
	 * maximize it.
	 */
	private _hideMaximizeWhileSessionsOnly(): void {
		const claim = this._register(new MutableDisposable());
		const activeAuxiliaryKeys = new Set([ActiveAuxiliaryContext.key]);
		const activeAuxiliary = observableFromEvent(this, Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(activeAuxiliaryKeys)), () => this._contextKeyService.getContextKeyValue<string>(ActiveAuxiliaryContext.key));
		// The Chat view can live in another container than its default one
		const chatViewContainer = observableFromEvent(this, Event.filter(this._viewDescriptorService.onDidChangeContainer, e => e.views.some(view => view.id === ChatViewId)), () => this._viewDescriptorService.getViewContainerByViewId(ChatViewId)?.id);
		this._register(autorun(reader => {
			const sessionsOnly = this._chatViewHostService.sessionsOnly.read(reader);
			const container = chatViewContainer.read(reader);
			const hidden = sessionsOnly && container !== undefined && activeAuxiliary.read(reader) === container;
			if (hidden && !claim.value) {
				claim.value = this._layoutService.hideAuxiliaryBarMaximize();
			} else if (!hidden) {
				claim.clear();
			}
		}));
	}
}

registerWorkbenchContribution2(ChatViewOpenInChatPartContribution.ID, ChatViewOpenInChatPartContribution, WorkbenchPhase.BlockStartup);
