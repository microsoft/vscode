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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../nls.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAquariumService } from '../../aquarium/browser/aquariumOverlay.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { WorkspacePicker, IWorkspaceSelection } from './sessionWorkspacePicker.js';
import { ScopedWorkspacePicker } from './scopedWorkspacePicker.js';
import { NewChatInputWidget } from './newChatInput.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

// #region --- New Chat Widget ---

class NewChatWidget extends Disposable {

	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;

	/** Tracks an in-flight wait for a provider's session types to become available. */
	private readonly _pendingSessionTypeWait = new MutableDisposable<IDisposable>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IAquariumService private readonly aquariumService: IAquariumService,
	) {
		super();
		const pickerCtor = isWeb ? ScopedWorkspacePicker : WorkspacePicker;
		this._workspacePicker = this._register(this.instantiationService.createInstance(pickerCtor));
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

		this._register(this.aquariumService.mountToggle(element));

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

		chatWidgetContainer.classList.add('revealed');
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
		try {
			await this.sessionsManagementService.sendAndCreateChat(session, { query, attachedContext });
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
