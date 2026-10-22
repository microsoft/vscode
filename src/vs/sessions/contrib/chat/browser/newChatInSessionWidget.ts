/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/newChatInSession.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { INestedChatWorkspace, INestedChatWorkspaceSupport, NestedChatWorkspaceError } from '../../../services/sessions/common/sessionsProvider.js';
import { IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { INestedChatFolderSources, isSameNestedChatWorkspace, NestedChatWorkspaceControls } from './nestedChatWorkspacePicker.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { isEqual } from '../../../../base/common/resources.js';
import { SharedChatInputComposer } from './sharedChatInputComposer.js';
import { isExperimentalSessionComposerLayoutEnabled } from './newChatWidget.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { getStoredSessionOptionsExpanded, SessionOptionsRow } from './sessionOptionsRow.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeLane } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeWidget.js';
import { chatInputStackClass, ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';

// #region --- New Chat In Session Widget ---

const STORAGE_KEY_SUB_SESSION_TIP_DISMISSED = 'sessions.subSessionTipDismissed';
const STORAGE_KEY_SESSION_OPTIONS_EXPANDED = 'sessions.nestedSession.sessionOptionsExpanded';

/**
 * A widget for composing a secondary chat within an existing session.
 * Looks like the New Session composer: the same input, options row and picker placement. There is
 * no harness (session type) or environment picker: the nested chat uses the parent session's agent
 * and host. Where the host supports it, folder, isolation and branch pickers choose the nested
 * chat's own workspace, which is applied to the composer's untitled chat when its first request is sent.
 */
export class NewChatInSessionWidget extends Disposable {

	private readonly _newChatInput: SharedChatInputComposer;
	private readonly _tipDisposable = this._register(new MutableDisposable());
	private readonly _session: IObservable<IActiveSession | undefined>;
	/**
	 * The chat this composer's view shows. With several chats open, the session's active chat can
	 * be another one, which this composer must neither bind to nor send to.
	 */
	private readonly _chat = observableValue<IChat | undefined>(this, undefined);
	/**
	 * When the experimental composer layout is enabled, the in-session input mirrors the
	 * new-session composer: the mode/permissions control moves into the input row and the model
	 * picker is right-aligned, keeping both surfaces consistent.
	 */
	private readonly _useExperimentalComposerLayout: IObservable<boolean>;
	private readonly _screenReaderOptimized: IObservable<boolean>;
	private readonly _collapsedSessionOptionsShowIcons: IObservable<boolean>;
	/**
	 * Whether the session options are shown. Starts from the user's New Session choice, but a choice
	 * made here is kept apart: New Session applies its experiment's default until the user chooses there.
	 */
	private readonly _sessionOptionsExpanded: ISettableObservable<boolean>;
	private readonly _workspaceSupport: IObservable<INestedChatWorkspaceSupport | undefined>;
	private readonly _workspaceControls: NestedChatWorkspaceControls;
	/**
	 * The workspace last applied to a chat whose request then failed: sending again with the same
	 * choice reuses it instead of asking the host again (which would create another worktree).
	 */
	private _appliedWorkspace: { readonly chat: URI; readonly workspace: INestedChatWorkspace } | undefined;

	constructor(
		_options: IChatViewOptions & { readonly inputVisible?: IObservable<boolean>; readonly petHostPreferred?: IObservable<boolean> },
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		this._useExperimentalComposerLayout = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING)
				|| event.affectsConfiguration(EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING)),
			() => isExperimentalSessionComposerLayoutEnabled(this.configurationService),
		);

		this._screenReaderOptimized = observableFromEvent(
			this,
			this.accessibilityService.onDidChangeScreenReaderOptimized,
			() => this.accessibilityService.isScreenReaderOptimized(),
		);
		this._collapsedSessionOptionsShowIcons = observableFromEvent(
			this,
			Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING)),
			() => this.configurationService.getValue<boolean>(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING),
		);
		this._sessionOptionsExpanded = observableValue(this, this._getInitialSessionOptionsExpanded());

		this._session = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession;
		});

		// Read per session, folder or host capability change, never per keystroke.
		this._workspaceSupport = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return undefined;
			}
			session.workspace.read(reader);
			session.capabilities.read(reader);
			return this.sessionsProvidersService.getProvider(session.providerId)?.getNestedChatWorkspaceSupport(session.sessionId, reader);
		});
		this._workspaceControls = this._register(this.instantiationService.createInstance(NestedChatWorkspaceControls, {
			support: this._workspaceSupport,
			resolveFolder: (folder, token) => this._requireProvider().resolveNestedChatFolder(this._requireSession().sessionId, folder, token),
			getBranches: (folder, token) => this._requireProvider().getNestedChatBranches(this._requireSession().sessionId, folder, '', token),
			getFolderSources: () => this._getFolderSources(),
			openLocalFolder: async () => (await this.fileDialogService.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false }))?.[0],
		}));
		// Another session starts over from its own default. The first session's default is selected by
		// the controls themselves, so opening resolves the folder once.
		let lastSessionId = this._session.get()?.sessionId;
		this._register(autorun(reader => {
			const sessionId = this._session.read(reader)?.sessionId;
			if (sessionId !== lastSessionId) {
				lastSessionId = sessionId;
				this._workspaceControls.reset();
			}
		}));

		const canSendRequest = derived(reader => {
			const session = this._session.read(reader);
			if (!session) {
				return false;
			}
			return true;
		});

		this._newChatInput = this._register(this.instantiationService.createInstance(SharedChatInputComposer, {
			session: this._session,
			chat: this._chat,
			sendRequest: async ({ query, attachments, background, userInteraction }) => this._send(query, attachments, background, userInteraction),
			inputVisible: _options.inputVisible,
			hostVisible: _options.hostVisible,
			canSendRequest,
			loading: constObservable(false),
			placeholder: localize('newChatInSessionPlaceholder', 'Ask a follow-up question or start a new topic within this session...'),
			petHostPreferred: _options.petHostPreferred,
			getChatPetPlatformElements: () => this._workspaceControls.getChatPetPlatformElements(),
			onDidChangeChatPetPlatform: this._workspaceControls.onDidChangeChatPetPlatform,
			renderRepositoryControls: container => this._workspaceControls.renderRepositoryControls(container),
			supportsBackground: true,
			voiceRoutesWhileSessionActive: true,
			useExperimentalLayout: this._useExperimentalComposerLayout,
		}));
	}

	// --- Rendering ---

	setChat(chat: IChat): void {
		this._chat.set(chat, undefined);
	}

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget.new-chat-in-session'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));

		// The New Session options row: the folder picker, then the session options (isolation and
		// branch) wherever the New Session composer shows its repository controls. Hidden when the
		// host can't give a nested chat its own workspace: then the composer is unchanged.
		const workspacePickerContainer = dom.append(chatWidgetContent, dom.$('.new-session-workspace-picker-container'));
		const row = dom.append(workspacePickerContainer, dom.$('.sessions-workspace-category-picker'));
		this._workspaceControls.renderFolderPicker(row);
		const sessionOptionsRow = this._register(new SessionOptionsRow(row, workspacePickerContainer, {
			user: 'NewChatInSessionWidget.sessionOptions',
			useExperimentalLayout: this._useExperimentalComposerLayout,
			screenReaderOptimized: this._screenReaderOptimized,
			expanded: this._sessionOptionsExpanded,
			collapsedShowIcons: this._collapsedSessionOptionsShowIcons,
			// Unlike New Session there is no harness picker: without a worktree to offer the tray is empty.
			hasDetails: this._workspaceControls.offersWorktree,
			setExpanded: expanded => {
				this._sessionOptionsExpanded.set(expanded, undefined);
				this.storageService.store(STORAGE_KEY_SESSION_OPTIONS_EXPANDED, expanded, StorageScope.PROFILE, StorageTarget.USER);
			},
		}));
		this._register(autorun(reader => {
			workspacePickerContainer.hidden = !this._workspaceSupport.read(reader);
			sessionOptionsRow.layout();
		}));

		this._newChatInput.render(chatWidgetContent, parent);
		this._register(autorun(reader => {
			const useExperimentalLayout = this._useExperimentalComposerLayout.read(reader);
			chatWidgetContent.classList.toggle('experimental-new-session-composer', useExperimentalLayout);
			this._newChatInput.placeRepositoryControls(useExperimentalLayout ? sessionOptionsRow.repositoryControlsHost : undefined);
			sessionOptionsRow.layout();
		}));
		// Rendered after the composer: the tip docks inside the composer's stack,
		// so the pet stands on it rather than on the composer boundary.
		this._renderSubSessionTip();

		chatWidgetContainer.classList.add('revealed');
	}

	private _renderSubSessionTip(): void {
		if (this.storageService.getBoolean(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, StorageScope.PROFILE, false)) {
			return;
		}

		const tipContainer = this._newChatInput.hostNoticeContainerElement;
		if (!tipContainer) {
			return;
		}

		const store = new DisposableStore();
		tipContainer.classList.add('sub-session-tip-container');

		const message = localize(
			'subSessionTip.message',
			"Start a parallel conversation to build on all the changes made in this session."
		);

		// Named by what it says, like every other tip: the label is both what the
		// landmark is called and what is spoken when the tip first appears.
		const tip = store.add(new ChatInputNoticeWidget({
			container: tipContainer,
			variant: ChatInputNoticeVariant.Tip,
			ariaLabel: message,
			ariaRoleDescription: localize('subSessionTip.ariaLabel', "New chat tip"),
		}));

		const iconEl = dom.append(tip.domNode, renderIcon(Codicon.lightbulb));
		iconEl.classList.add('sub-session-tip-icon');

		const textEl = dom.append(tip.domNode, dom.$('span.sub-session-tip-text'));
		textEl.textContent = message;

		const dismiss = () => {
			// Removing the banner would strand keyboard focus on <body>, which also
			// drops the context keys the chat keybindings depend on.
			const hadFocus = tip.hasFocus();
			this.storageService.store(STORAGE_KEY_SUB_SESSION_TIP_DISMISSED, true, StorageScope.PROFILE, StorageTarget.USER);
			// Stood down before it leaves the DOM: once detached it cannot report.
			setChatInputStackSlot(tipContainer, ChatInputStackSlot.Empty);
			// The slot belongs to the composer, so only the tip inside it goes away.
			this._tipDisposable.clear();
			if (hadFocus) {
				this._newChatInput.focus();
			}
		};

		tip.addDismissAction({
			ariaLabel: localize('subSessionTip.dismiss', "Dismiss tip"),
			onActivate: dismiss,
		});

		// Claims the tip lane above this input, so the banner yields to a
		// notification or a first-run introduction instead of stacking with them.
		// Hidden until the claim leads, which it does immediately when nothing
		// else holds the space.
		let leading = false;
		let announced = false;
		setChatInputStackSlot(tipContainer, ChatInputStackSlot.Empty);
		store.add(this._newChatInput.noticeHost.occupy(ChatInputNoticeLane.Tip, {
			focusTarget: {
				hasFocus: () => tip.hasFocus(),
				focus: () => tip.focus(),
				canFocus: () => leading,
			},
			onDidChangeLeading: isLeading => {
				leading = isLeading;
				setChatInputStackSlot(tipContainer, isLeading ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
				// Spoken once, the first time it actually reaches the screen. The
				// lane can hand back and forth as notifications come and go, and
				// re-announcing on every return would talk over the user.
				if (isLeading && !announced) {
					announced = true;
					tip.announce();
				}
			},
		}));
		this._tipDisposable.value = store;
	}

	private _getInitialSessionOptionsExpanded(): boolean {
		return this.storageService.getBoolean(STORAGE_KEY_SESSION_OPTIONS_EXPANDED, StorageScope.PROFILE)
			?? getStoredSessionOptionsExpanded(this.storageService)
			?? true;
	}

	/** Recent folders of the session's provider, and a local folder dialog when it runs on this computer. */
	private _getFolderSources(): INestedChatFolderSources {
		const session = this._session.get();
		const provider = session && this.sessionsProvidersService.getProvider(session.providerId);
		if (!session || !provider) {
			return { recentFolders: [], canOpenLocalFolder: false };
		}
		const recentFolders = this.recentWorkspacesService.getRecentWorkspaces(false)
			.filter(recent => recent.providerId === session.providerId)
			.map(recent => recent.workspace.folders[0]?.workingDirectory)
			.filter((folder): folder is URI => !!folder);
		return { recentFolders, canOpenLocalFolder: provider.supportsLocalWorkspaces === true };
	}

	private _requireSession(): IActiveSession {
		const session = this._session.get();
		if (!session) {
			throw new NestedChatWorkspaceError('notSupported', localize('nestedChat.noSession', "There is no session to add a nested session to."));
		}
		return session;
	}

	private _requireProvider() {
		const provider = this.sessionsProvidersService.getProvider(this._requireSession().providerId);
		if (!provider) {
			throw new NestedChatWorkspaceError('notSupported', localize('nestedChat.noProvider', "The agent of this session is not available."));
		}
		return provider;
	}

	// --- Send ---

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean, userInteraction?: NewChatUserInteraction): Promise<boolean> {
		const activeSession = this._session.get();
		if (!activeSession) {
			return false;
		}
		const activeChat = this._chat.get() ?? activeSession.activeChat.get();
		const workspace = this._workspaceSupport.get() ? this._workspaceControls.getWorkspace() : undefined;
		// A chosen workspace is applied to the chat the composer opened with before its first request,
		// so the nested session stays one chat. Refused or failed, the chat is left as it was and the
		// composer keeps the draft.
		let workspaceApplied = false;
		const alreadyApplied = !!workspace && !!this._appliedWorkspace && isEqual(this._appliedWorkspace.chat, activeChat.resource) && isSameNestedChatWorkspace(this._appliedWorkspace.workspace, workspace);
		if (workspace && !alreadyApplied) {
			if (!await this._applyWorkspace(activeSession, activeChat, workspace, query)) {
				userInteraction?.cancel('error');
				return false;
			}
			workspaceApplied = true;
			this._appliedWorkspace = { chat: activeChat.resource, workspace };
			if (this._store.isDisposed) {
				// The composer went away while the workspace was applied: the request is still sent, so
				// the chat doesn't stay behind with a workspace and no turn. Nothing is left to measure.
				userInteraction?.cancel('cancelled');
				userInteraction = undefined;
			}
		}
		try {
			// Reset the composer before dispatching the send: both touch shared
			// chat-session state for chats in the same group, and running them
			// concurrently races and leaves the sent chat stuck spinning.
			if (background && !this._store.isDisposed) {
				await this.sessionsService.openNewChatInSession(activeSession, { forceNew: true });
			}

			userInteraction?.handoff(activeSession, activeChat);
			await this.sessionsManagementService.sendRequest(activeSession, activeChat, {
				query, attachedContext, background,
				...(userInteraction ? { onDidCreateResponse: userInteraction.onDidCreateResponse } : {}),
			});
			this._appliedWorkspace = undefined;
			if ((workspaceApplied || alreadyApplied) && !this._store.isDisposed) {
				this._workspaceControls.reset();
			}
			return true;
		} catch (e) {
			userInteraction?.cancel(isCancellationError(e) ? 'cancelled' : 'error');
			this.logService.error('Failed to send secondary chat request:', e);
			return false;
		}
	}

	/**
	 * Gives the composer's untitled chat the chosen workspace. Shows why when the host refuses; the
	 * host then leaves the chat as it was (no folder, worktree or scratch folder attached).
	 */
	private async _applyWorkspace(activeSession: IActiveSession, chat: IChat, workspace: INestedChatWorkspace, query: string): Promise<boolean> {
		try {
			if (chat.status.get() !== SessionStatus.Untitled) {
				throw new NestedChatWorkspaceError('refused', localize('nestedChat.alreadyStarted', "The nested session already started, so its workspace can't change."));
			}
			await this.sessionsManagementService.applyNestedChatWorkspace(activeSession, chat, workspace, query);
			return true;
		} catch (e) {
			if (!isCancellationError(e)) {
				this.logService.error('Failed to apply the chosen workspace to the nested chat:', e);
				this.notificationService.error(e instanceof NestedChatWorkspaceError
					? e.message
					: localize('nestedChat.createFailed', "The nested session could not be created: {0}", toErrorMessage(e)));
			}
			return false;
		}
	}

	layout(height: number, width: number): void {
		this._newChatInput.layout(height, width);
	}

	focusInput(): void {
		this._newChatInput.focus();
	}

	attach(uris: URI[]): void {
		this._newChatInput.attach(uris);
	}
}

// #endregion
