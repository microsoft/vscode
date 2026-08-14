/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedObservableWithCache, autorun, IObservable, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { localize } from '../../../../nls.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession, SESSION_WORKSPACE_GROUP_GITHUB, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { IOpenNewSessionResult, ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { isAllowSignedOutWhenUsableEnabled, shouldShowGitHubWorkspaceGroupSignIn } from '../../../browser/sessionsAuthGate.js';
import { AGENTIC_SIGN_IN_COMMAND_ID } from '../../../common/sessionCommands.js';
import { IAquariumService, IMountedToggleHandle } from '../../aquarium/browser/aquariumOverlay.js';
import { WorkspacePicker } from './sessionWorkspacePicker.js';
import { WebWorkspacePicker } from './webWorkspacePicker.js';
import { IPreferredSessionType } from './sessionTypePicker.js';
import { NewChatInputWidget } from './newChatInput.js';
import { NoAgentHostEmptyState } from './noAgentHostEmptyState.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { SessionWorkspacePickerVisibleContext } from '../../../common/contextkeys.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { buildNewSessionPrompt } from '../../agentFeedback/browser/agentFeedbackAttachmentEntry.js';
import { SessionInputBannerWidget } from '../../sessionInputBanners/browser/sessionInputBannerWidget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ChatInputTipPresenter } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputTipPresenter.js';
import { chatInputStackClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';

// #region --- New Chat Widget ---

/** Minimum number of started sessions required before showing tips and promotions. */
const MIN_SESSIONS_FOR_FIRST_RUN_NOTICES = 2;

export class NewChatWidget extends Disposable {

	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;
	private readonly _chatTipPresenter = this._register(new MutableDisposable<ChatInputTipPresenter>());
	private _isChatTipSessionInitialized = false;
	private _aquariumToggle: IMountedToggleHandle | undefined;

	/** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
	private readonly _pendingPreferredUpgrade = new MutableDisposable<IDisposable>();
	private readonly _newSessionCreation = new MutableDisposable<IDisposable>();

	/**
	 * The currently mounted no-agent-host empty state, if any. Set by
	 * {@link _renderEmptyStateGate} while the empty state replaces the
	 * workspace picker; consulted by {@link focusInput} to route focus to
	 * the visible heading instead of the (hidden) chat input.
	 */
	private _activeEmptyState: NoAgentHostEmptyState | undefined;

	/**
	 * Whether to render the session type ("harness") picker below the input
	 * (in the controls) instead of next to the workspace picker. Read once from
	 * the view options at construction time; the widget does not react to later
	 * changes of the source observable.
	 */
	private readonly _renderHarnessPickerInControls: boolean;

	private readonly _session: IObservable<IActiveSession | undefined>;

	/** Whether the active draft is a workspace-less quick chat (hides the workspace picker). */
	private readonly _isQuickChatComposer: IObservable<boolean>;

	/** Draft comments shared by every uncreated new-session composer. */
	private readonly _feedbackItems: IObservable<readonly IAgentFeedback[]>;

	/** In-flight background sends awaiting confirmation before their comments are cleared. */
	private readonly _pendingBackgroundSends = this._register(new DisposableMap<object>());

	/** The workspace-row container hosting the inline harness picker (desktop, non-quick-chat). */
	private _workspacePickerRow: HTMLElement | undefined;

	/** The quick-chat header row hosting the inline harness picker (desktop, quick chat). */
	private _quickChatHeaderPickerHost: HTMLElement | undefined;

	/**
	 * Tracks whether the workspace picker is currently rendered (vs replaced by
	 * the no-agent-host empty state on web). Consumed by the new-session-view
	 * onboarding tour to skip the workspace step when the picker is not shown.
	 */
	private readonly _workspacePickerVisibleKey: IContextKey<boolean>;

	constructor(
		private readonly options: IChatViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IAquariumService private readonly aquariumService: IAquariumService,
		@IAgentHostFilterService private readonly agentHostFilterService: IAgentHostFilterService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatTipService private readonly chatTipService: IChatTipService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IStorageService private readonly storageService: IStorageService,
		@INewSessionComposerService newSessionComposerService: INewSessionComposerService,
	) {
		super();
		this._workspacePickerVisibleKey = SessionWorkspacePickerVisibleContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._workspacePickerVisibleKey.reset()));
		this._renderHarnessPickerInControls = this.options.renderSessionTypePickerInControls.get();
		this._register(this._pendingPreferredUpgrade);
		this._register(this._newSessionCreation);

		// TODO: @sandy081 The session/chat should be passed down. There should not be sessionsService.activeSession read in the widget.
		this._session = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, prev) => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			if (activeSession && activeSession.isCreated.read(reader)) {
				return prev;
			}
			return activeSession;
		});

		// A quick chat is workspace-less; the composer hides the workspace picker
		// (nothing to pick) and surfaces the session-type picker in the controls.
		this._isQuickChatComposer = derived(this, reader => {
			const session = this._session.read(reader);
			return session?.isQuickChat?.read(reader) ?? false;
		});

		// On web (vscode.dev / insiders.vscode.dev), use {@link WebWorkspacePicker}
		// which scopes recents to the active host and renders as a bottom
		// sheet on phone-layout viewports. On Electron desktop, the regular
		// {@link WorkspacePicker} is fine — phones never run there.
		const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor, {
			canRestoreWorkspace: () => !this._isQuickChatComposer.get(),
			getWorkspaceGroupAction: group => {
				if (group === SESSION_WORKSPACE_GROUP_GITHUB && shouldShowGitHubWorkspaceGroupSignIn(
					this.defaultAccountService.currentDefaultAccount !== null,
					isAllowSignedOutWhenUsableEnabled(this.configurationService),
				)) {
					return {
						label: localize('workspacePicker.signInGitHub', "Sign in to GitHub"),
						icon: Codicon.signIn,
						commandId: AGENTIC_SIGN_IN_COMMAND_ID,
						hideWorkspaceItems: true,
					};
				}
				return undefined;
			},
		}));

		const feedbackChanged = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
		this._feedbackItems = derived(this, reader => {
			feedbackChanged.read(reader);
			return this.agentFeedbackService.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE)
				.filter(item => item.state === AgentFeedbackState.Accepted);
		});

		const canSendRequest = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			if (session.loading.read(reader)) {
				return false;
			}
			return true;
		});

		const loading = derived(reader => {
			const session = this._session.read(reader);
			return session?.loading.read(reader) ?? false;
		});
		const hasFeedback = derived(this, reader => this._feedbackItems.read(reader).length > 0);
		const canSubmitWithoutSession = derived(this, reader => !this._session.read(reader) && hasFeedback.read(reader));
		const deferredNotificationsEnabled = observableFromEvent(
			this,
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, TOTAL_SESSIONS_KEY, this._store),
			() => this._hasEnoughSessionsForFirstRunNotices(),
		);

		const newChatInput = this.instantiationService.createInstance(NewChatInputWidget, {
			session: this._session,
			getContextFolderUri: () => this._getContextFolderUri(),
			getWorkspacePreselectionSource: () => this._isQuickChatComposer.get()
				? NewSessionWorkspacePreselectionSource.None
				: this._workspacePicker.preselectionSource,
			sendRequest: async ({ query, attachments, background }) => this._send(query, attachments, background),
			canSendRequest,
			canSubmitWithoutSession,
			hasAdditionalSendContent: hasFeedback,
			loading,
			historyKey: constObservable(undefined), // no persisted history for the new-session view
			renderSessionTypePickerInControls: this._renderHarnessPickerInControls,
			supportsBackground: true,
			deferredNotificationsEnabled,
		});
		this._register(toDisposable(() => newChatInput.saveState()));
		this._newChatInput = this._register(newChatInput);
		this._register(newSessionComposerService.registerComposer(this._newChatInput));

		// Comment 3: Bind Agent mode in the scoped context so that Agent-only tips
		// (messageQueueing, subagents, etc.) are eligible and chatModeKind-based
		// when-clauses evaluate correctly against this composer's actual mode.
		const chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
		chatModeKindKey.set(ChatModeKind.Agent);
		this._register(toDisposable(() => chatModeKindKey.reset()));

		// Comment 4: Route tip command links to this composer's own pickers
		// so they do not fall through to IChatWidgetService.lastFocusedWidget
		// (which this composer is not registered with).
		this._register(this.openerService.registerOpener({
			open: async (resource: URI | string): Promise<boolean> => {
				if (!this._chatTipPresenter.value?.current) {
					return false;
				}
				const link = typeof resource === 'string' ? resource : resource.toString();
				if (link === 'command:workbench.action.chat.openModelPicker') {
					this._newChatInput.openModelPicker();
					return true;
				}
				if (link === 'command:workbench.action.chat.openPlan') {
					// Plan mode is not available in the new-session composer; consume
					// the link without action so it does not misfire on a stale widget.
					return true;
				}
				return false;
			}
		}));

		this._register(this._workspacePicker.onDidSelectWorkspace(async folderUri => {
			await this._onWorkspaceSelected(folderUri);
			this._newChatInput.focus();
		}));
		this._register(this._newChatInput.sessionTypePicker.onDidSelectSessionType(async pick => {
			// A quick chat has no folder: re-create the draft with the picked
			// type via openQuickChat (mirrors the folder path's draft recreation).
			if (this._isQuickChatComposer.get()) {
				this.sessionsService.openQuickChat(pick ? { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId } : undefined);
				this._newChatInput.focus();
				return;
			}
			await this._onWorkspaceSelected(this._workspacePicker.selectedFolderUri);
			this._newChatInput.focus();
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration('chat.tips.enabled')) {
				return;
			}
			if (this.configurationService.getValue<boolean>('chat.tips.enabled')) {
				this._renderChatTip();
			} else {
				this._clearChatTip();
			}
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, TOTAL_SESSIONS_KEY, this._store)(() => this._renderChatTip()));
		const foregroundSessionCountContextKeys = new Set([ChatContextKeys.foregroundSessionCount.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(foregroundSessionCountContextKeys)) {
				this._renderChatTip();
			}
		}));

		// Comment 2: Re-evaluate the tip when the selected model changes, because
		// some tips (e.g. tip.switchToAuto) are only eligible for specific models.
		let previousModelId: string | undefined;
		this._register(autorun(reader => {
			const modelId = this._newChatInput.selectedModelState.read(reader).currentModel?.identifier;
			if (previousModelId !== undefined && previousModelId !== modelId) {
				this._renderChatTip();
			}
			previousModelId = modelId;
		}));

		// Re-sync the picker's displayed selection when the session's workspace
		// changes externally (e.g. sessionsService.openNewSession({ folderUri })).
		let previousFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const folderUri = session?.workspace.read(reader)?.folders[0]?.root;
			this._handlePromptOptionsWorkspaceChange(previousFolderUri, folderUri);
			previousFolderUri = folderUri;
			if (folderUri && !this.uriIdentityService.extUri.isEqual(folderUri, this._workspacePicker.selectedFolderUri)) {
				this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
			}
		}));
	}

	private _handlePromptOptionsWorkspaceChange(previousFolderUri: URI | undefined, folderUri: URI | undefined): void {
		const workspaceChanged = previousFolderUri
			? !folderUri || !this.uriIdentityService.extUri.isEqual(previousFolderUri, folderUri)
			: !!folderUri;
		if (!workspaceChanged) {
			return;
		}
		if (folderUri) {
			void this._refreshPromptOptions();
		} else {
			this._newChatInput.clearPromptOptions();
		}
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));

		this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));
		const aquariumAction = this._register(new Action(
			'sessions.aquarium.showAction',
			localize('aquariumAction', "Aquarium"),
			undefined,
			true,
			() => this.aquariumService.toggleActionVisibility()
		));
		const petAction = this._register(new Action(
			'sessions.chatPet.toggle',
			localize('petAction', "Pet (/vscode-pet)"),
			undefined,
			true,
			() => this.chatPetService.toggle()
		));
		this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (target && chatWidgetContent.contains(target)) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();
			aquariumAction.checked = this.aquariumService.actionVisible.get();
			petAction.checked = this.chatPetService.enabled.get();
			const anchor = new StandardMouseEvent(dom.getWindow(element), e);
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => [aquariumAction, petAction],
				getCheckedActionsRepresentation: () => 'checkbox',
			});
		}));

		const workspacePickerContainer = dom.append(chatWidgetContent, dom.$('.new-session-workspace-picker-container'));
		// On web (vscode.dev / insiders.vscode.dev) the workspace picker is
		// scoped to the currently selected agent host. When no hosts are
		// known there is nothing for the user to pick, so swap the picker
		// out for the no-agent-host empty state. On Electron desktop the
		// regular picker is always functional (the local Copilot provider
		// is always available) so this branch is web-only.
		this._register(isWeb
			? this._renderEmptyStateGate(workspacePickerContainer, chatWidgetContent)
			: this._renderWorkspacePicker(workspacePickerContainer));

		// Quick-chat composer header (workspace-less): a top-of-input "New Chat"
		// label plus the inline session-type picker. Shown only in quick-chat
		// mode via the `.quick-chat` class on the content (see CSS). On web the
		// composer is never a quick chat, so it stays empty/hidden there.
		if (!isWeb && !this._renderHarnessPickerInControls) {
			const quickChatHeaderRow = dom.append(chatWidgetContent, dom.$('.new-session-quick-chat-header.session-workspace-picker'));
			const quickChatHeaderLabel = dom.append(quickChatHeaderRow, dom.$('.session-workspace-picker-label'));
			quickChatHeaderLabel.textContent = localize('newChatHeader', "New Chat");
			const quickChatWithLabel = dom.append(quickChatHeaderRow, dom.$('.session-workspace-picker-label.session-workspace-picker-with-label'));
			quickChatWithLabel.textContent = localize('newSessionWith', "with");
			this._quickChatHeaderPickerHost = dom.append(quickChatHeaderRow, dom.$('.new-chat-quick-chat-header-picker-host'));
		}

		this._renderFeedbackBanner(chatWidgetContent);
		this._newChatInput.render(chatWidgetContent, parent);

		// The tip lives in the input's notice slot, so the presenter is created
		// after the input has rendered it.
		const chatTipContainer = this._newChatInput.gettingStartedTipContainerElement;
		this._chatTipPresenter.value = chatTipContainer && this.instantiationService.createInstance(
			ChatInputTipPresenter,
			{
				container: chatTipContainer,
				// Reset tip rotation the first time this composer becomes the only
				// foreground surface, so a returning user gets a fresh tip.
				onBeforeUpdate: () => {
					if (this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key) !== 0) {
						this._isChatTipSessionInitialized = false;
					} else if (!this._isChatTipSessionInitialized) {
						this._isChatTipSessionInitialized = true;
						this.chatTipService.resetSession();
					}
				},
				// No tip in the no-agent-host empty state: there is no usable composer.
				// Tips also stay away until the user has actually started a couple of
				// sessions, so a first-run composer is not busy.
				isEligible: () => !chatWidgetContent.classList.contains('no-agent-host')
					&& this._hasEnoughSessionsForFirstRunNotices()
					&& this.contextKeyService.getContextKeyValue<number>(ChatContextKeys.foregroundSessionCount.key) === 0,
				focusInput: () => this.focusInput(),
			},
			this._newChatInput.noticeHost,
		);

		// Quick chat composer: hide the workspace picker for workspace-less
		// drafts (there is nothing to pick) and reflect it in the picker-visible
		// context key. Quick chats are only created on desktop (the local agent
		// host), so leave the web empty-state gate's key management untouched.
		this._register(autorun(reader => {
			const isQuickChat = this._isQuickChatComposer.read(reader);
			chatWidgetContent.classList.toggle('quick-chat', isQuickChat);
			if (!isWeb) {
				this._workspacePickerVisibleKey.set(!isQuickChat);
			}
		}));

		// Desktop harness-picker placement: a quick chat renders the session-type
		// picker in its top-of-input header row; otherwise (including after a
		// Cmd+N swap out of a quick chat) it re-parents into the workspace row.
		if (!isWeb && !this._renderHarnessPickerInControls) {
			this._register(autorun(reader => {
				const isQuickChat = this._isQuickChatComposer.read(reader);
				const target = isQuickChat ? this._quickChatHeaderPickerHost : this._workspacePickerRow;
				if (target) {
					this._newChatInput.sessionTypePicker.render(target, { className: 'sessions-chat-session-type-picker' });
				}
			}));
		}

		// Create initial session for any workspace already selected at construct time.
		// If the selection arrives later (provider registers asynchronously), the
		// picker fires onDidSelectWorkspace and our listener handles it.
		// Skip if an active session already exists (restored by openNewSession
		// from a new-session draft when navigating back from another session).
		this._seedWorkspaceDraft();

		// Re-seed the workspace draft when the composer swaps out of quick-chat
		// mode (e.g. Cmd+N discards a quick chat, leaving the reused composer
		// session-less): without an active session the session-type picker has no
		// folder types and hides itself, so restore the last folder to match a
		// freshly-opened new-session composer.
		if (!isWeb) {
			let wasQuickChat = this._isQuickChatComposer.get();
			this._register(autorun(reader => {
				const isQuickChat = this._isQuickChatComposer.read(reader);
				if (wasQuickChat && !isQuickChat && !this._session.read(reader)) {
					if (!this._workspacePicker.refreshAutomaticSelection()) {
						this._seedWorkspaceDraft();
					}
				}
				wasQuickChat = isQuickChat;
			}));
		}

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderChatTip(): void {
		this._chatTipPresenter.value?.update();
	}

	private _clearChatTip(): void {
		this._chatTipPresenter.value?.clear();
	}

	private _hasEnoughSessionsForFirstRunNotices(): boolean {
		return this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) >= MIN_SESSIONS_FOR_FIRST_RUN_NOTICES;
	}

	/**
	 * Seed the new-session draft from the workspace picker's restored folder,
	 * unless an active session already exists (then just sync the picker to it).
	 */
	private _seedWorkspaceDraft(): void {
		const restoredFolderUri = this._workspacePicker.selectedFolderUri;
		if (!this._syncWorkspacePickerFromActiveSession() && restoredFolderUri) {
			void this._createNewSession(restoredFolderUri);
		}
	}

	/**
	 * If a new-session draft was restored by {@link openNewSession}, sync
	 * the workspace picker to match the session's workspace. The picker may
	 * have restored a workspace from a different provider (e.g. remote vs
	 * local), so overwrite it with the session's actual workspace without
	 * firing the event (which would trigger {@link _onWorkspaceSelected} and
	 * create a new session).
	 *
	 * @returns `true` if an active session was found and the picker was synced.
	 */
	private _syncWorkspacePickerFromActiveSession(): boolean {
		const activeSession = this._session.get();
		if (!activeSession) {
			return false;
		}

		const sessionWorkspace = activeSession.workspace.get();
		const folderUri = sessionWorkspace?.folders[0]?.root;
		if (folderUri) {
			this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
			this._replaceDraftOnUnservableHarness(folderUri, activeSession);
		}

		return true;
	}

	/**
	 * Replaces a restored draft whose harness the folder can no longer serve.
	 * A draft outlives navigation, so it can name a session type that has since
	 * stopped being advertised. Keeping it would leave the composer showing, and
	 * sending to, an agent the harness picker doesn't list. An empty type list
	 * means the folder's providers haven't reported yet (a late-connecting agent
	 * host), so the draft is left alone.
	 */
	private _replaceDraftOnUnservableHarness(folderUri: URI, draft: IActiveSession): void {
		if (draft.isCreated.get()) {
			return;
		}
		const pick = { providerId: draft.providerId, sessionTypeId: draft.sessionType };
		if (this.sessionsManagementService.getSessionTypesForFolder(folderUri).length === 0 || this._isPreferredServable(folderUri, pick)) {
			return;
		}
		void this._createNewSession(folderUri);
	}

	private _isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean {
		return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some(t =>
			(pick.providerId === undefined || t.providerId === pick.providerId)
			&& t.sessionType.id === pick.sessionTypeId);
	}

	private async _createNewSession(folderUri: URI): Promise<IOpenNewSessionResult> {
		this._pendingPreferredUpgrade.clear();
		const creationCts = new CancellationTokenSource();
		const creationLifecycle = toDisposable(() => creationCts.dispose(true));
		this._newSessionCreation.value = creationLifecycle;
		const userPick = this._newChatInput.sessionTypePicker.getUserPickedSessionType();
		// Session creation is async, so a provider can start serving the folder
		// (e.g. the local agent host finishing its handshake) between the call
		// below and the listener installed after it. That change would land in
		// the gap and be lost, leaving the composer without a draft — and with
		// the harness picker hidden — until the user re-picks the workspace.
		// Record it here so the listener can replay it.
		const pendingChange = new DisposableStore();
		let changedWhilePending = false;
		pendingChange.add(this.sessionsManagementService.onDidChangeSessionTypes(() => changedWhilePending = true));
		let result: IOpenNewSessionResult;
		try {
			result = await this._createSessionNow(folderUri, userPick, creationCts.token);
		} finally {
			pendingChange.dispose();
		}
		const isCurrentCreation = this._newSessionCreation.value === creationLifecycle;
		if (isCurrentCreation) {
			this._newSessionCreation.clear();
		} else {
			return result;
		}
		if (result.trustDeclined) {
			// The user explicitly declined trust: don't schedule a retry, which
			// would silently recreate (and possibly re-prompt) the draft once a
			// provider registers/changes without any further user action.
			this._pendingPreferredUpgrade.clear();
			return result;
		}
		// Keep the draft in sync with late-registering providers. Agent hosts
		// connect lazily, so there is no timeout — the listener lives until the
		// draft is sent or replaced. We watch when:
		//  - no provider can serve the folder yet (!result.session),
		//  - the user's explicit pick isn't servable yet (created with a
		//    fallback, upgrade once its provider connects), or
		//  - there is no explicit pick, so the draft tracks the preferred
		//    (first) type, which can change as the folder's session-type list
		//    grows.
		if (!result.session || !userPick || !this._isPreferredServable(folderUri, userPick)) {
			this._scheduleRecreateOnProviderChange(folderUri, userPick, result.session, changedWhilePending);
		}
		return result;
	}

	private async _createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined, token: CancellationToken): Promise<IOpenNewSessionResult> {
		// Prefer the user's explicit pick when its provider can serve the
		// folder; otherwise fall back to the preferred (first) session type.
		const preferredPick = userPick && this._isPreferredServable(folderUri, userPick)
			? userPick
			: this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
		// A signed-out user (under the conditional-auth opt-in) can't run a type
		// that requires GitHub, so default to the first offered type usable
		// without it. No-op when signed in or the opt-in is off — today's behavior.
		// TODO: reconsider silently switching away from the remembered selection;
		// instead keep it and surface an inline "sign in for this type" affordance
		// for GitHub-only types.
		const effectivePick = this._preferUsableSessionTypeWhenSignedOut(folderUri, preferredPick);
		const fallbackProviderId = this._workspacePicker.selectedResolved?.providerId;
		try {
			return await this.sessionsService.openNewSession({
				folderUri,
				...(effectivePick
					? { providerId: effectivePick.providerId, sessionTypeId: effectivePick.sessionTypeId }
					: fallbackProviderId
						? { providerId: fallbackProviderId }
						: undefined),
			}, token);
		} catch (e) {
			this.logService.error('Failed to create new session:', e);
			return { session: undefined, trustDeclined: false };
		}
	}

	/**
	 * While the user is signed out and the conditional-auth opt-in is on, replace
	 * a pick that requires GitHub with the first offered session type usable
	 * without it. A no-op when signed in, when the opt-in is off (today's
	 * behavior), or when no offered type is usable — in which case the caller's
	 * existing fallbacks still apply.
	 */
	private _preferUsableSessionTypeWhenSignedOut(folderUri: URI, pick: IPreferredSessionType | undefined): IPreferredSessionType | undefined {
		if (this.defaultAccountService.currentDefaultAccount !== null || !isAllowSignedOutWhenUsableEnabled(this.configurationService)) {
			return pick;
		}
		const usable = this.sessionsManagementService.getSessionTypesForFolder(folderUri)
			.filter(type => type.sessionType.authRequirement === SessionTypeAuthRequirement.None);
		// Match on provider too when the pick names one: two providers can offer
		// the same session type id, and only one of them may be usable.
		const pickIsUsable = usable.some(type => type.sessionType.id === pick?.sessionTypeId
			&& (pick?.providerId === undefined || type.providerId === pick.providerId));
		if (usable.length === 0 || pickIsUsable) {
			return pick;
		}
		return { providerId: usable[0].providerId, sessionTypeId: usable[0].sessionType.id };
	}

	private _scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined, replayMissedChange: boolean): void {
		const store = new DisposableStore();
		store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recreateOnProviderChange(folderUri, userPick, created)));
		this._pendingPreferredUpgrade.value = store;
		if (replayMissedChange) {
			this._recreateOnProviderChange(folderUri, userPick, created);
		}
	}

	private _recreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void {
		if (created) {
			const active = this._session.get();
			if (active?.sessionId !== created.sessionId || active.isCreated.get()) {
				return; // the draft was sent or is no longer the active session
			}
			if (userPick) {
				if (!this._isPreferredServable(folderUri, userPick)) {
					return; // the preferred provider still cannot serve the folder
				}
			} else {
				// No explicit pick: keep the draft on the preferred (first)
				// type. Recreate only when that preferred actually changed.
				const preferred = this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
				if (!preferred || (preferred.providerId === active.providerId && preferred.sessionTypeId === active.sessionType)) {
					return;
				}
			}
		}
		void this._createNewSession(folderUri);
	}

	/**
	 * Returns the workspace URI for the context picker based on the current workspace selection.
	 */
	private _getContextFolderUri(): URI | undefined {
		return this._workspacePicker.selectedFolderUri;
	}

	private _renderWorkspacePicker(container: HTMLElement): IDisposable {
		this._workspacePickerVisibleKey.set(true);
		const pickersRow = dom.append(container, dom.$('.session-workspace-picker'));
		const pickersLabel = dom.append(pickersRow, dom.$('.session-workspace-picker-label'));
		pickersLabel.textContent = this._workspacePicker.selectedFolderUri
			? localize('newSessionIn', "New session in")
			: localize('newSessionChooseWorkspace', "Start by picking a");

		this._workspacePicker.render(pickersRow);

		if (!this._renderHarnessPickerInControls) {
			const withLabel = dom.append(pickersRow, dom.$('.session-workspace-picker-label.session-workspace-picker-with-label'));
			withLabel.textContent = localize('newSessionWith', "with");
			this._workspacePickerRow = pickersRow;
			// On web the composer is never a quick chat, so keep the harness
			// picker inline in the workspace row. On desktop the placement is
			// reactive (controls row for quick chats) — see the render() autorun.
			if (isWeb) {
				this._newChatInput.sessionTypePicker.render(pickersRow, { className: 'sessions-chat-session-type-picker' });
			}
		}
		return this._workspacePicker.onDidSelectWorkspace(() => {
			const folderUri = this._workspacePicker.selectedFolderUri;
			pickersLabel.textContent = folderUri
				? localize('newSessionIn', "New session in")
				: localize('newSessionChooseWorkspace', "Start by picking a");
		});
	}

	private _renderEmptyState(container: HTMLElement): IDisposable {
		this._workspacePickerVisibleKey.set(false);
		const emptyState = this.instantiationService.createInstance(NoAgentHostEmptyState);
		emptyState.render(container);
		this._activeEmptyState = emptyState;
		return {
			dispose: () => {
				if (this._activeEmptyState === emptyState) {
					this._activeEmptyState = undefined;
				}
				emptyState.dispose();
			},
		};
	}

	/**
	 * Web-only: hosts the workspace picker, but swaps it out for the
	 * no-agent-host empty state once we are *sure* there are no hosts —
	 * i.e. after a discovery cycle has completed. Rendering the empty
	 * state before discovery has run would briefly flash it at users who
	 * actually have hosts that just haven't been discovered yet (e.g.
	 * cached tunnels resolved on startup). Until then we keep the regular
	 * workspace picker, which has its own loading affordance.
	 */
	private _renderEmptyStateGate(container: HTMLElement, chatWidgetContent: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const pickerSlot = dom.append(container, dom.$('.session-workspace-picker-slot'));
		const stateDisposables = store.add(new MutableDisposable());

		const showPicker = () => {
			chatWidgetContent.classList.remove('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderWorkspacePicker(pickerSlot);
			this._renderChatTip();
		};

		const showEmptyState = () => {
			chatWidgetContent.classList.add('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderEmptyState(pickerSlot);
			this._clearChatTip();
		};

		const filter = this.agentHostFilterService;
		let hasCompletedDiscovery = filter.hosts.length > 0;

		// If no discovery cycle is in flight or has completed yet, kick one
		// off so the empty state can resolve in a bounded time. The
		// `tunnelAgentHost.contribution` already triggers a startup
		// rediscover, but in the (rare) case the view mounts before the
		// contribution gets a chance, this prevents the user from being
		// stuck on a picker that never gets populated.
		if (!hasCompletedDiscovery && !filter.isDiscovering) {
			filter.rediscover();
		}

		const update = () => {
			if (hasCompletedDiscovery && !filter.isDiscovering && filter.hosts.length === 0) {
				showEmptyState();
			} else {
				showPicker();
			}
		};

		update();

		// `onDidChange` fires when the host list changes — entering or
		// leaving the empty state if the last host disconnects or the
		// first host appears.
		store.add(filter.onDidChange(() => {
			if (filter.hosts.length > 0) {
				hasCompletedDiscovery = true;
			}
			update();
		}));
		// `onDidChangeDiscovering` fires on discovery start *and* end; we
		// treat any transition out of discovering as having completed at
		// least one cycle.
		store.add(filter.onDidChangeDiscovering(() => {
			if (!filter.isDiscovering) {
				hasCompletedDiscovery = true;
			}
			update();
		}));

		return store;
	}

	// --- Send ---

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean): Promise<boolean> {
		const session = this._session.get();
		if (!session) {
			this._workspacePicker.showPicker();
			return false;
		}
		const feedbackItems = [...this._feedbackItems.get()];
		const workspaceRoots = session.workspace.get()?.folders.map(folder => folder.root)
			?? (this._workspacePicker.selectedFolderUri ? [this._workspacePicker.selectedFolderUri] : []);
		const request = buildNewSessionPrompt(query, feedbackItems, workspaceRoots);

		// Capture the composer's workspace selection before the send: a
		// background send consumes the in-flight new session and resets the
		// new-session view, so we re-seed a fresh pending session afterwards
		// (see below) to keep the composer's pickers functional. Quick chats
		// have no workspace, so they re-seed via openQuickChat instead.
		const wasQuickChat = this._isQuickChatComposer.get();
		const reseedFolderUri = background && !wasQuickChat ? this._workspacePicker.selectedFolderUri : undefined;
		const sendOptions = { query: request, attachedContext, background };
		const clearFeedback = () => {
			for (const item of feedbackItems) {
				this.agentFeedbackService.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, item.id);
			}
		};
		// A background send is fire-and-forget and the composer immediately reseeds
		// for the next one, so several can be in flight at once. Each is tracked
		// separately, keyed by the options object it was started with, so one
		// send's outcome never clears another's comments.
		if (background) {
			this._pendingBackgroundSends.set(sendOptions, Event.once(
				Event.filter(this.sessionsManagementService.onDidSendRequest, event => event.options === sendOptions)
			)(() => {
				clearFeedback();
				this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			}));
		}

		try {
			await this.sessionsManagementService.sendNewChatRequest(session, sendOptions);
		} catch (e) {
			this._pendingBackgroundSends.deleteAndDispose(sendOptions);
			this.logService.error('Failed to send request:', e);
			return false;
		}

		if (!background) {
			clearFeedback();
		}

		// A background send graduated the composer's in-flight session and
		// returned the view to a fresh (but session-less) new-session composer.
		// The send now commits in the background, so reseed a replacement draft
		// immediately — providers are multi-new-session aware, so the graduating
		// session and this new draft coexist. This restores the
		// session-type/model pickers for the next message.
		if (background) {
			if (wasQuickChat) {
				this.sessionsService.openQuickChat();
			} else if (reseedFolderUri) {
				await this._createNewSession(reseedFolderUri);
			}
		}
		return true;
	}

	private _renderFeedbackBanner(container: HTMLElement): void {
		const host = dom.append(container, dom.$('.session-input-banners.new-session-feedback-banners'));
		const content = this._register(new MutableDisposable<DisposableStore>());
		this._register(autorun(reader => {
			const feedbackItems = this._feedbackItems.read(reader);
			content.clear();
			dom.clearNode(host);
			if (!feedbackItems.length) {
				setChatInputStackSlot(host, ChatInputStackSlot.Empty);
				return;
			}

			const count = feedbackItems.length;
			const text = count === 1
				? localize('newSessionFeedback.one', "1 comment")
				: localize('newSessionFeedback.many', "{0} comments", count);
			const store = new DisposableStore();
			content.value = store;
			const banner = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, {
				icon: Codicon.commentDiscussion,
				accent: false,
				text,
				ariaLabel: text,
				actions: [{
					label: localize('newSessionFeedback.reveal', "Reveal"),
					run: () => this.agentFeedbackService.revealFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, feedbackItems[0].id),
				}],
			}));
			host.appendChild(banner.domNode);
			// Docks to the composer below it.
			setChatInputStackSlot(host, ChatInputStackSlot.Docked);
		}));
	}

	saveState(): void {
		this._newChatInput.saveState();
	}

	layout(_height: number, _width: number): void {
		this._newChatInput.layout(_height, _width);
	}

	focusInput(): void {
		// While the empty state is mounted, the chat input is hidden via
		// CSS (`.no-agent-host` on `.new-chat-widget-content`) so focusing
		// it would just send focus to <body>. Land on the empty state's
		// heading instead so the user has a visible focus target.
		if (this._activeEmptyState) {
			this._activeEmptyState.focus();
			return;
		}
		this._newChatInput.focus();
	}

	/**
	 * Handles a workspace selection from the workspace picker and creates a
	 * new session for it. Workspace trust (when required) is requested by
	 * {@link ISessionsService.openNewSession} itself — a single gate shared
	 * by every path that creates a concrete session for a folder.
	 */
	private async _onWorkspaceSelected(folderUri: URI | undefined): Promise<void> {
		// Cancel any in-flight upgrade for a previous selection.
		this._pendingPreferredUpgrade.clear();
		const currentFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
		const refreshingPromptOptions = !!currentFolderUri
			&& (!folderUri || !this.uriIdentityService.extUri.isEqual(currentFolderUri, folderUri))
			&& this._newChatInput.preparePromptOptionsRefresh();

		if (!folderUri) {
			this.sessionsService.unsetNewSession();
			return;
		}

		if (this._store.isDisposed) {
			return;
		}

		const result = await this._createNewSession(folderUri);
		if (refreshingPromptOptions && !result.session) {
			this._newChatInput.showPromptOptions(undefined);
		}
		if (result.trustDeclined) {
			// Don't leave the picker showing the declined folder as selected.
			this._workspacePicker.removeFromRecents(folderUri);
		}
	}

	private async _refreshPromptOptions(): Promise<void> {
		try {
			await this._newChatInput.refreshPromptOptions();
		} catch (error) {
			this.logService.error('Failed to refresh new-session prompt options:', error);
			this._newChatInput.showPromptOptions(undefined);
		}
	}

	prefillInput(text: string): void {
		this._newChatInput.prefillInput(text);
	}

	setHostVisible(visible: boolean): void {
		this._aquariumToggle?.setHostVisible(visible);
	}

	sendQuery(text: string): void {
		this._newChatInput.sendQuery(text);
	}

	submitInput(): Promise<boolean> {
		if (!this._session.get()) {
			this._workspacePicker.showPicker();
			return Promise.resolve(false);
		}
		return this._newChatInput.submit();
	}

	attach(uris: URI[]): void {
		this._newChatInput.attach(uris);
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._workspacePicker.setSelectedWorkspace(folderUri, { providerId });
	}
}

// #endregion
