/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../nls.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAquariumService, IMountedToggleHandle, isAquariumAsSessionsEnabled, SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from '../../aquarium/browser/aquariumOverlay.js';
import { IAquariumSubmitIntentService } from '../../aquarium/browser/aquariumSubmitIntentService.js';
import { SessionPopulationDriver } from '../../aquarium/browser/sessionPopulationDriver.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { WorkspacePicker, IWorkspaceSelection } from './sessionWorkspacePicker.js';
import { WebWorkspacePicker } from './webWorkspacePicker.js';
import { NewChatInputWidget } from './newChatInput.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

// #region --- New Chat Widget ---

type AquariumChatInputTrigger = 'click' | 'submit' | 'outside' | 'esc' | 'scopeChanged';

class NewChatWidget extends Disposable {

	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;
	private _aquariumToggle: IMountedToggleHandle | undefined;

	/** Tracks an in-flight wait for a provider's session types to become available. */
	private readonly _pendingSessionTypeWait = new MutableDisposable<IDisposable>();

	private _chatWidgetContainer: HTMLElement | undefined;
	private _aquariumModeActive = false;
	private _revealed = true;
	private _sessionDriverFactoryApplied = false;
	private _hotspotButton: HTMLButtonElement | undefined;
	private readonly _hotspotStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _aquariumDismissStore = this._register(new MutableDisposable<DisposableStore>());
	private _autoDismissTimer = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IAquariumService private readonly aquariumService: IAquariumService,
		@IAquariumSubmitIntentService private readonly aquariumSubmitIntentService: IAquariumSubmitIntentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		// On web (vscode.dev / insiders.vscode.dev), use {@link WebWorkspacePicker}
		// which scopes recents to the active host and renders as a bottom
		// sheet on phone-layout viewports. On Electron desktop, the regular
		// {@link WorkspacePicker} is fine — phones never run there.
		const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor));
		this._register(this._pendingSessionTypeWait);

		const canSendRequest = derived(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			if (!session) {
				return false;
			}
			return !session.loading.read(reader);
		});

		const loading = derived(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			return session?.loading.read(reader) ?? false;
		});

		this._newChatInput = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async (text: string, attachedContext?: IChatRequestVariableEntry[]) => this._send(text, attachedContext),
			canSendRequest,
			loading,
		}));

		this._register(this._workspacePicker.onDidSelectWorkspace(async workspace => {
			if (workspace) {
				const selectedSessionType = this._newChatInput.sessionTypePicker.selectedType;
				const validSessionTypes = this.sessionsProvidersService.getProvider(workspace.providerId)?.getSessionTypes(workspace.workspace.repositories[0].uri);
				const validSessionType = selectedSessionType ? validSessionTypes?.find(type => type.id === selectedSessionType) : validSessionTypes?.[0];
				await this._onWorkspaceSelected(workspace, validSessionType?.id);
			} else {
				await this._onWorkspaceSelected(undefined, undefined);
			}
			this._newChatInput.focus();
		}));
		this._register(this._newChatInput.sessionTypePicker.onDidSelectSessionType(async sessionType => {
			await this._onWorkspaceSelected(this._workspacePicker.selectedProject, sessionType);
			this._newChatInput.focus();
		}));
	}

	// --- Rendering ---

	render(parent: HTMLElement): void {
		const element = dom.append(parent, dom.$('.sessions-chat-widget'));
		const chatWidgetContainer = dom.append(element, dom.$('.new-chat-widget-container'));
		const chatWidgetContent = dom.append(chatWidgetContainer, dom.$('.new-chat-widget-content'));
		this._chatWidgetContainer = chatWidgetContainer;

		this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));

		const workspacePickerContainer = dom.append(chatWidgetContent, dom.$('.new-session-workspace-picker-container'));
		this._register(this._renderWorkspacePicker(workspacePickerContainer));

		this._newChatInput.render(chatWidgetContent, parent);

		// Create initial session for any workspace already selected at construct time.
		// If the selection arrives later (provider registers asynchronously), the
		// picker fires onDidSelectWorkspace and our listener handles it.
		// Skip if an active session already exists (restored by openNewSessionView
		// from a pending new session when navigating back from another session).
		const restoredProject = this._workspacePicker.selectedProject;
		if (!this._syncWorkspacePickerFromActiveSession() && restoredProject) {
			this._createNewSession(restoredProject, this._newChatInput.sessionTypePicker.selectedType);
		}

		// Default to the legacy "input visible" experience. The aquarium-mode
		// controller below collapses it on first evaluation when the combined
		// gate (developerJoy + aquariumAsSessions + agent-host scope) is on.
		chatWidgetContainer.classList.add('revealed');

		this._setupAquariumModeController(chatWidgetContainer);
	}

	/**
	 * When the aquarium-as-sessions gate is on, hide the new-chat input +
	 * workspace picker and surface a transparent click-catcher hotspot so the
	 * user sees the aquarium first. Reveal on click / focus / keyboard,
	 * dismiss on submit / outside-click / Esc.
	 */
	private _setupAquariumModeController(chatWidgetContainer: HTMLElement): void {
		const recompute = () => this._recomputeAquariumMode(chatWidgetContainer);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING)
				|| e.affectsConfiguration(SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING)) {
				recompute();
			}
		}));

		recompute();
	}

	private _isAquariumModeActive(): boolean {
		if (this.configurationService.getValue<boolean>(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING) !== true) {
			return false;
		}
		return isAquariumAsSessionsEnabled(this.configurationService);
	}

	private _recomputeAquariumMode(chatWidgetContainer: HTMLElement): void {
		const wasActive = this._aquariumModeActive;
		const nowActive = this._isAquariumModeActive();
		this._aquariumModeActive = nowActive;

		chatWidgetContainer.classList.toggle('aquarium-mode-collapsed', nowActive);

		if (nowActive && !this._sessionDriverFactoryApplied) {
			this._aquariumToggle?.setDriverFactory(() => this.instantiationService.createInstance(SessionPopulationDriver));
			this._sessionDriverFactoryApplied = true;
			this._logPopulationMode('sessions');
		} else if (!nowActive && this._sessionDriverFactoryApplied) {
			this._aquariumToggle?.setDriverFactory(undefined);
			this._sessionDriverFactoryApplied = false;
			this._logPopulationMode('random');
		}

		if (nowActive) {
			this._installHotspot(chatWidgetContainer);
			this._installAquariumDismissHandlers(chatWidgetContainer);
			// On entering aquarium mode (or first eval) start collapsed.
			if (!wasActive) {
				this._setRevealed(false, chatWidgetContainer, /*focus*/ false, 'scopeChanged');
			}
		} else {
			this._teardownHotspot();
			this._aquariumDismissStore.clear();
			this._autoDismissTimer.clear();
			// Force the legacy always-visible experience when out of scope.
			this._setRevealed(true, chatWidgetContainer, /*focus*/ false, 'scopeChanged');
		}
	}

	private _setRevealed(revealed: boolean, chatWidgetContainer: HTMLElement, focus: boolean, trigger: AquariumChatInputTrigger): void {
		if (this._revealed === revealed) {
			return;
		}
		this._revealed = revealed;
		chatWidgetContainer.classList.toggle('revealed', revealed);
		this._logChatInputAction(revealed ? 'reveal' : 'dismiss', trigger);
		if (!focus) {
			return;
		}
		if (revealed) {
			this._newChatInput.focus();
		} else {
			this._hotspotButton?.focus();
		}
	}

	private _installHotspot(chatWidgetContainer: HTMLElement): void {
		if (this._hotspotStore.value) {
			return;
		}
		const store = new DisposableStore();
		this._hotspotStore.value = store;
		const button = dom.$('button.aquarium-compose-hotspot') as HTMLButtonElement;
		button.type = 'button';
		button.setAttribute('aria-label', localize('aquarium.composeHotspot.aria', "Compose new agent chat"));
		button.textContent = localize('aquarium.composeHotspot.label', "Click to compose…");
		// Keep the hotspot above the aquarium toggle's stacking context so
		// pointer events on empty space reach the button rather than the
		// (decorative, pointer-events:none) aquarium layers.
		chatWidgetContainer.appendChild(button);
		store.add({ dispose: () => button.remove() });
		store.add(dom.addDisposableListener(button, dom.EventType.CLICK, () => {
			if (this._aquariumModeActive) {
				this._setRevealed(true, chatWidgetContainer, /*focus*/ true, 'click');
			}
		}));
		this._hotspotButton = button;
	}

	private _teardownHotspot(): void {
		this._hotspotStore.clear();
		this._hotspotButton = undefined;
	}

	private _installAquariumDismissHandlers(chatWidgetContainer: HTMLElement): void {
		if (this._aquariumDismissStore.value) {
			return;
		}
		const store = new DisposableStore();
		this._aquariumDismissStore.value = store;
		const targetWindow = dom.getWindow(chatWidgetContainer);

		// Outside-input click → dismiss. The chat widget container fills the
		// whole pane, so "outside the container" is unreachable; instead
		// dismiss whenever the click target isn't inside the actual input,
		// picker, footer, or any floating popup. Use the generic mouse/touch
		// helper so taps on iOS / touch surfaces also dismiss.
		store.add(dom.addDisposableGenericMouseDownListener(targetWindow.document, (e: MouseEvent) => {
			if (!this._aquariumModeActive || !this._revealed) {
				return;
			}
			const target = e.target as HTMLElement | null;
			if (!target) {
				return;
			}
			if (target.closest('.new-chat-input-container, .new-session-workspace-picker-container, .new-chat-bottom-container, .monaco-list, .monaco-action-bar, .context-view, .monaco-menu, .monaco-hover, .monaco-quick-input-widget, .agents-aquarium-toggle')) {
				return;
			}
			this._setRevealed(false, chatWidgetContainer, /*focus*/ false, 'outside');
		}, true));

		// Esc → dismiss. Falls through to Monaco's native handler when the
		// input has partial text so the first press still clears it; a
		// second press (or a press while empty) backs out to the aquarium.
		store.add(dom.addDisposableListener(chatWidgetContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key !== 'Escape') {
				return;
			}
			if (!this._aquariumModeActive || !this._revealed) {
				return;
			}
			if (!this._newChatInput.isInputEmpty()) {
				return;
			}
			e.stopPropagation();
			this._setRevealed(false, chatWidgetContainer, /*focus*/ true, 'esc');
		}, true));
	}

	private _scheduleAquariumAutoDismiss(): void {
		if (!this._aquariumModeActive || !this._chatWidgetContainer) {
			return;
		}
		const container = this._chatWidgetContainer;
		const targetWindow = dom.getWindow(container);
		this._autoDismissTimer.clear();
		// Brief delay so the user sees the submit-fish spawn before the chat
		// input slides away.
		const delayMs = this.accessibilityService.isMotionReduced() ? 0 : 250;
		const handle = targetWindow.setTimeout(() => {
			if (this._aquariumModeActive) {
				this._setRevealed(false, container, /*focus*/ false, 'submit');
			}
		}, delayMs);
		this._autoDismissTimer.value = { dispose: () => targetWindow.clearTimeout(handle) };
	}

	private _logPopulationMode(mode: 'random' | 'sessions'): void {
		type AquariumPopulationModeEvent = {
			mode: string;
		};
		type AquariumPopulationModeClassification = {
			mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which population driver is active for the aquarium overlay (random crowd vs 1:1 session mapping).' };
			owner: 'osortega';
			comment: 'Tracks adoption of the hidden "aquarium-as-sessions" developer-joy mode in the Agents new-chat view.';
		};
		this.telemetryService.publicLog2<AquariumPopulationModeEvent, AquariumPopulationModeClassification>('aquarium.populationMode', { mode });
	}

	private _logChatInputAction(action: 'reveal' | 'dismiss', trigger: AquariumChatInputTrigger): void {
		// Only meaningful when the aquarium-mode controller is in scope (the
		// non-aquarium force-reveal still flows through here on first eval to
		// keep state coherent, but its trigger is `'scopeChanged'`).
		type AquariumChatInputEvent = {
			action: string;
			trigger: string;
		};
		type AquariumChatInputClassification = {
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the chat input was revealed or dismissed.' };
			trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What caused the reveal or dismiss (click on hotspot, submit success, outside click, escape, scope change).' };
			owner: 'osortega';
			comment: 'Tracks reveal/dismiss interactions on the aquarium-as-sessions collapsed chat input.';
		};
		this.telemetryService.publicLog2<AquariumChatInputEvent, AquariumChatInputClassification>('aquarium.chatInput', { action, trigger });
	}

	/**
	 * If a pending session was restored by {@link openNewSessionView}, sync
	 * the workspace picker to match the session's workspace. The picker may
	 * have restored a workspace from a different provider (e.g. remote vs
	 * local), so overwrite it with the session's actual workspace without
	 * firing the event (which would trigger {@link _onWorkspaceSelected} and
	 * create a new session).
	 *
	 * @returns `true` if an active session was found and the picker was synced.
	 */
	private _syncWorkspacePickerFromActiveSession(): boolean {
		const activeSession = this.sessionsManagementService.activeSession.get();
		if (!activeSession) {
			return false;
		}

		const sessionWorkspace = activeSession.workspace.get();
		if (sessionWorkspace) {
			this._workspacePicker.setSelectedWorkspace(
				{ providerId: activeSession.providerId, workspace: sessionWorkspace },
				/* fireEvent */ false,
			);
		}

		return true;
	}

	private _createNewSession(selection: IWorkspaceSelection, sessionTypeId: string | undefined): void {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === selection.providerId);
		const repoUri = selection.workspace.repositories[0].uri;

		// Drop the carried-over sessionTypeId if it doesn't apply to this provider —
		// happens when the picker upgrades to a different provider after restore and
		// the previous active session's type (e.g. EH CLI's "agents") doesn't exist
		// on the new provider (e.g. agent host).
		if (sessionTypeId && provider && !provider.getSessionTypes(repoUri).some(t => t.id === sessionTypeId)) {
			sessionTypeId = undefined;
		}

		// Session types may not be available yet (e.g., agent host still connecting).
		// If so, wait for them before creating the session — otherwise createNewSession
		// throws and the new chat view is left without an active session, which hides
		// agent-host-specific UI (model picker etc.) until the user re-picks the workspace.
		// If the connection fails, the picker fires onDidSelectWorkspace(undefined) which
		// clears the pending wait via _onWorkspaceSelected.
		if (provider && !sessionTypeId && provider.getSessionTypes(repoUri).length === 0 && provider.onDidChangeSessionTypes) {
			const pendingStore = new DisposableStore();
			this._pendingSessionTypeWait.value = pendingStore;

			pendingStore.add(provider.onDidChangeSessionTypes(() => {
				if (provider.getSessionTypes(repoUri).length > 0) {
					this._pendingSessionTypeWait.clear();
					this._createNewSession(selection, sessionTypeId);
				}
			}));

			return;
		}

		try {
			this.sessionsManagementService.createNewSession(selection.providerId, repoUri, sessionTypeId);
		} catch (e) {
			this.logService.error('Failed to create new session:', e);
		}
	}

	/**
	 * Returns the workspace URI for the context picker based on the current workspace selection.
	 */
	private _getContextFolderUri(): URI | undefined {
		return this._workspacePicker.selectedProject?.workspace.repositories[0]?.uri;
	}

	private _renderWorkspacePicker(container: HTMLElement): IDisposable {
		const pickersRow = dom.append(container, dom.$('.session-workspace-picker'));
		const pickersLabel = dom.append(pickersRow, dom.$('.session-workspace-picker-label'));
		pickersLabel.textContent = this._workspacePicker.selectedProject
			? localize('newSessionIn', "New session in")
			: localize('newSessionChooseWorkspace', "Start by picking a");

		this._workspacePicker.render(pickersRow);
		return this._workspacePicker.onDidSelectWorkspace(() => {
			const workspace = this._workspacePicker.selectedProject;
			pickersLabel.textContent = workspace ? localize('newSessionIn', "New session in") : localize('newSessionChooseWorkspace', "Start by picking a");
		});
	}

	// --- Send ---

	private async _send(query: string, attachedContext?: IChatRequestVariableEntry[]): Promise<void> {
		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			this._workspacePicker.showPicker();
			return;
		}
		// Record the submit intent BEFORE awaiting so the
		// SessionPopulationDriver can consume it the moment the new agent-host
		// session is registered. The service is a no-op when the
		// sessions-aware aquarium isn't active.
		this.aquariumSubmitIntentService.recordIntent();
		try {
			await this.sessionsManagementService.sendAndCreateChat(session, { query, attachedContext });
			// In aquarium-mode, slide the chat input back away so the user can
			// see the new fish appear from the input area.
			this._scheduleAquariumAutoDismiss();
		} catch (e) {
			this.logService.error('Failed to send request:', e);
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
		this._newChatInput.focus();
	}

	/**
	 * Handles a workspace selection from the workspace picker.
	 * Requests folder trust if needed and creates a new session.
	 */
	private async _onWorkspaceSelected(selection: IWorkspaceSelection | undefined, sessionTypeId: string | undefined): Promise<void> {
		// Cancel any in-flight wait for a previous selection.
		this._pendingSessionTypeWait.clear();

		if (!selection) {
			this.sessionsManagementService.unsetNewSession();
			return;
		}

		if (selection.workspace.requiresWorkspaceTrust) {
			const workspaceUri = selection.workspace.repositories[0]?.uri;
			if (workspaceUri && !await this._requestFolderTrust(workspaceUri)) {
				return;
			}
		}

		this._createNewSession(selection, sessionTypeId);
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

	selectWorkspace(workspace: IWorkspaceSelection): void {
		this._workspacePicker.setSelectedWorkspace(workspace);
	}
}

// #endregion

// #region --- New Chat View Pane ---

export const SessionsViewId = 'workbench.view.sessions.chat';

export class NewChatViewPane extends ViewPane {

	private _widget: NewChatWidget | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._widget = this._register(this.instantiationService.createInstance(
			NewChatWidget,
		));

		this._widget.render(container);
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget?.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this._widget?.focusInput();
	}

	prefillInput(text: string): void {
		this._widget?.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._widget?.sendQuery(text);
	}

	selectWorkspace(workspace: IWorkspaceSelection): void {
		this._widget?.selectWorkspace(workspace);
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this._widget?.setHostVisible(visible);
		if (visible) {
			this._widget?.focusInput();
		}
	}

	override saveState(): void {
		this._widget?.saveState();
	}

	override dispose(): void {
		this._widget?.saveState();
		super.dispose();
	}
}

// #endregion
