/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedObservableWithCache, autorun, IObservable } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IAquariumService, IMountedToggleHandle } from '../../aquarium/browser/aquariumOverlay.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { WorkspacePicker } from './sessionWorkspacePicker.js';
import { WebWorkspacePicker } from './webWorkspacePicker.js';
import { IPreferredSessionType } from './sessionTypePicker.js';
import { NewChatInputWidget } from './newChatInput.js';
import { NoAgentHostEmptyState } from './noAgentHostEmptyState.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { SessionWorkspacePickerVisibleContext } from '../../../common/contextkeys.js';

// #region --- New Chat Widget ---

export class NewChatWidget extends Disposable {

	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;
	private _aquariumToggle: IMountedToggleHandle | undefined;

	/** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
	private readonly _pendingPreferredUpgrade = new MutableDisposable<IDisposable>();

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
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IAquariumService private readonly aquariumService: IAquariumService,
		@IAgentHostFilterService private readonly agentHostFilterService: IAgentHostFilterService,
	) {
		super();
		this._workspacePickerVisibleKey = SessionWorkspacePickerVisibleContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._workspacePickerVisibleKey.reset()));
		this._renderHarnessPickerInControls = this.options.renderSessionTypePickerInControls.get();
		// On web (vscode.dev / insiders.vscode.dev), use {@link WebWorkspacePicker}
		// which scopes recents to the active host and renders as a bottom
		// sheet on phone-layout viewports. On Electron desktop, the regular
		// {@link WorkspacePicker} is fine — phones never run there.
		const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor));
		this._register(this._pendingPreferredUpgrade);

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

		const newChatInput = this.instantiationService.createInstance(NewChatInputWidget, {
			session: this._session,
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async ({ query, attachments, background }) => this._send(query, attachments, background),
			canSendRequest,
			loading,
			historyKey: constObservable(undefined), // no persisted history for the new-session view
			renderSessionTypePickerInControls: this._renderHarnessPickerInControls,
			supportsBackground: true,
		});
		this._register(toDisposable(() => newChatInput.saveState()));
		this._newChatInput = this._register(newChatInput);

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
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$('.new-chat-widget-content'));

		this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));

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

		this._newChatInput.render(chatWidgetContent, parent);

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
					this._seedWorkspaceDraft();
				}
				wasQuickChat = isQuickChat;
			}));
		}

		chatWidgetContainer.classList.add('revealed');
	}

	/**
	 * Seed the new-session draft from the workspace picker's restored folder,
	 * unless an active session already exists (then just sync the picker to it).
	 */
	private _seedWorkspaceDraft(): void {
		const restoredFolderUri = this._workspacePicker.selectedFolderUri;
		if (!this._syncWorkspacePickerFromActiveSession() && restoredFolderUri) {
			this._createNewSession(restoredFolderUri);
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
		}

		return true;
	}

	private _isPreferredServable(folderUri: URI, pick: IPreferredSessionType): boolean {
		return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some(t =>
			(pick.providerId === undefined || t.providerId === pick.providerId)
			&& t.sessionType.id === pick.sessionTypeId);
	}

	private _createNewSession(folderUri: URI): void {
		this._pendingPreferredUpgrade.clear();
		const userPick = this._newChatInput.sessionTypePicker.getUserPickedSessionType();
		const created = this._createSessionNow(folderUri, userPick);
		// Keep the draft in sync with late-registering providers. Agent hosts
		// connect lazily, so there is no timeout — the listener lives until the
		// draft is sent or replaced. We watch when:
		//  - no provider can serve the folder yet (!created),
		//  - the user's explicit pick isn't servable yet (created with a
		//    fallback, upgrade once its provider connects), or
		//  - there is no explicit pick, so the draft tracks the preferred
		//    (first) type, which can change as the folder's session-type list
		//    grows.
		if (!created || !userPick || !this._isPreferredServable(folderUri, userPick)) {
			this._scheduleRecreateOnProviderChange(folderUri, userPick, created);
		}
	}

	private _createSessionNow(folderUri: URI, userPick: IPreferredSessionType | undefined): ISession | undefined {
		// Prefer the user's explicit pick when its provider can serve the
		// folder; otherwise fall back to the preferred (first) session type.
		const effectivePick = userPick && this._isPreferredServable(folderUri, userPick)
			? userPick
			: this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
		const fallbackProviderId = this._workspacePicker.selectedResolved?.providerId;
		try {
			return this.sessionsService.openNewSession({
				folderUri,
				...(effectivePick
					? { providerId: effectivePick.providerId, sessionTypeId: effectivePick.sessionTypeId }
					: fallbackProviderId
						? { providerId: fallbackProviderId }
						: undefined),
			});
		} catch (e) {
			this.logService.error('Failed to create new session:', e);
			return undefined;
		}
	}

	private _scheduleRecreateOnProviderChange(folderUri: URI, userPick: IPreferredSessionType | undefined, created: ISession | undefined): void {
		const store = new DisposableStore();
		store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => {
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
			this._createNewSession(folderUri);
		}));
		this._pendingPreferredUpgrade.value = store;
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
		};

		const showEmptyState = () => {
			chatWidgetContent.classList.add('no-agent-host');
			dom.clearNode(pickerSlot);
			stateDisposables.value = this._renderEmptyState(pickerSlot);
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

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[], background?: boolean): Promise<void> {
		const session = this._session.get();
		if (!session) {
			this._workspacePicker.showPicker();
			return;
		}

		// Capture the composer's workspace selection before the send: a
		// background send consumes the in-flight new session and resets the
		// new-session view, so we re-seed a fresh pending session afterwards
		// (see below) to keep the composer's pickers functional. Quick chats
		// have no workspace, so they re-seed via openQuickChat instead.
		const wasQuickChat = this._isQuickChatComposer.get();
		const reseedFolderUri = background && !wasQuickChat ? this._workspacePicker.selectedFolderUri : undefined;

		try {
			await this.sessionsManagementService.sendNewChatRequest(session, { query, attachedContext, background });
		} catch (e) {
			this.logService.error('Failed to send request:', e);
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
				this._createNewSession(reseedFolderUri);
			}
		}
	}

	private async _requestFolderTrust(folderUri: URI): Promise<boolean> {
		const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
			uri: folderUri,
			message: localize('trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
		});
		if (!trusted) {
			this._workspacePicker.removeFromRecents(folderUri);
		}
		return !!trusted;
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
	 * Handles a workspace selection from the workspace picker.
	 * Requests folder trust if needed and creates a new session.
	 */
	private async _onWorkspaceSelected(folderUri: URI | undefined): Promise<void> {
		// Cancel any in-flight upgrade for a previous selection.
		this._pendingPreferredUpgrade.clear();

		if (!folderUri) {
			this.sessionsService.unsetNewSession();
			return;
		}

		const resolved = this.sessionsManagementService.resolveWorkspace(folderUri);
		if (resolved?.workspace.requiresWorkspaceTrust) {
			if (!await this._requestFolderTrust(folderUri)) {
				return;
			}
		}

		if (!this._store.isDisposed) {
			this._createNewSession(folderUri);
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

	attach(uris: URI[]): void {
		this._newChatInput.attach(uris);
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._workspacePicker.setSelectedWorkspace(folderUri, { providerId });
	}
}

// #endregion
