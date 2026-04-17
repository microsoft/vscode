/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
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
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { WorkspacePicker, IWorkspaceSelection } from './sessionWorkspacePicker.js';
import { NewChatInputWidget } from './newChatInput.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

// #region --- New Chat Widget ---

class NewChatWidget extends Disposable {

	private readonly _workspacePicker: WorkspacePicker;
	private readonly _newChatInput: NewChatInputWidget;
	/** Observable reporting the currently selected workspace's provider, if any. */
	private readonly _selectedProvider: IObservable<ISessionsProvider | undefined>;
	/** Observable preparing label derived from the selected provider's readiness. */
	private readonly _preparingLabel: IObservable<string | undefined>;
	/** Disposable for the pending "retry once ready" autorun per workspace selection. */
	private readonly _pendingReadyRun = this._register(new MutableDisposable());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) {
		super();
		this._workspacePicker = this._register(this.instantiationService.createInstance(WorkspacePicker));

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

		const selectedWorkspaceObs = observableFromEvent(this, this._workspacePicker.onDidSelectWorkspace, () => this._workspacePicker.selectedProject);
		const providersChangedObs = observableFromEvent(this, this.sessionsProvidersService.onDidChangeProviders, () => this.sessionsProvidersService.getProviders());

		this._selectedProvider = derived(reader => {
			// Recompute when the workspace picker's selection or the set of providers change.
			selectedWorkspaceObs.read(reader);
			providersChangedObs.read(reader);
			const providerId = this._workspacePicker.selectedProject?.providerId;
			if (!providerId) {
				return undefined;
			}
			return this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		});

		this._preparingLabel = derived(reader => {
			const provider = this._selectedProvider.read(reader);
			const readiness = provider?.readiness?.read(reader);
			if (!readiness || readiness.state === 'ready') {
				return undefined;
			}
			return readiness.label;
		});

		this._newChatInput = this._register(this.instantiationService.createInstance(NewChatInputWidget, {
			getContextFolderUri: () => this._getContextFolderUri(),
			sendRequest: async (text: string, attachedContext?: IChatRequestVariableEntry[]) => this._send(text, attachedContext),
			canSendRequest,
			loading,
			preparingLabel: this._preparingLabel,
		}));

		this._register(this._workspacePicker.onDidSelectWorkspace(async workspace => {
			await this._onWorkspaceSelected(workspace, this._newChatInput.sessionTypePicker.selectedType);
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

		const workspacePickerContainer = dom.append(chatWidgetContent, dom.$('.new-session-workspace-picker-container'));
		this._renderWorkspacePicker(workspacePickerContainer);

		this._newChatInput.render(chatWidgetContent, parent);

		// Create initial session. `_tryCreateNewSession` handles the case where
		// the restored project's provider isn't registered yet (startup race).
		const restoredProject = this._workspacePicker.selectedProject;
		if (restoredProject) {
			this._tryCreateNewSession(restoredProject, this._newChatInput.sessionTypePicker.selectedType);
		}

		chatWidgetContainer.classList.add('revealed');
	}

	private _createNewSession(selection: IWorkspaceSelection, sessionTypeId: string | undefined): void {
		this.sessionsManagementService.createNewSession(selection.providerId, selection.workspace.repositories[0].uri, sessionTypeId);
	}

	/**
	 * Create a new session if the selected provider is ready; otherwise invoke
	 * {@link ISessionsProvider.prepare} and arm a one-shot autorun that retries
	 * creation as soon as readiness transitions to `ready` for the same selection.
	 *
	 * If the selection's provider hasn't been registered yet (startup race),
	 * waits for the matching registration and then retries.
	 */
	private _tryCreateNewSession(selection: IWorkspaceSelection, sessionTypeId: string | undefined): void {
		this._pendingReadyRun.clear();

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === selection.providerId);
		if (!provider) {
			// Provider not yet registered — wait for it and retry.
			this._pendingReadyRun.value = this.sessionsProvidersService.onDidChangeProviders(() => {
				if (this.sessionsProvidersService.getProviders().some(p => p.id === selection.providerId)) {
					this._tryCreateNewSession(selection, sessionTypeId);
				}
			});
			return;
		}

		const session = this.sessionsManagementService.createNewSession(selection.providerId, selection.workspace.repositories[0].uri, sessionTypeId);
		if (session) {
			return;
		}

		// Provider not ready — kick off any preparation and wait for readiness.
		const workspaceUri = selection.workspace.repositories[0].uri;
		provider.prepare?.(workspaceUri).catch(e => this.logService.warn('[NewChatWidget] provider.prepare failed:', e));

		this._pendingReadyRun.value = autorun(reader => {
			const readiness = provider.readiness?.read(reader);
			if (readiness && readiness.state !== 'ready') {
				return;
			}
			// Ensure the selection is still the same before retrying.
			const current = this._workspacePicker.selectedProject;
			if (current?.providerId !== selection.providerId
				|| current.workspace.repositories[0]?.uri.toString() !== workspaceUri.toString()) {
				this._pendingReadyRun.clear();
				return;
			}
			this._pendingReadyRun.clear();
			this._createNewSession(selection, sessionTypeId);
		});
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
		if (!selection) {
			this._pendingReadyRun.clear();
			this.sessionsManagementService.unsetNewSession();
			return;
		}

		if (selection.workspace.requiresWorkspaceTrust) {
			const workspaceUri = selection.workspace.repositories[0]?.uri;
			if (workspaceUri && !await this._requestFolderTrust(workspaceUri)) {
				return;
			}
		}

		this._tryCreateNewSession(selection, sessionTypeId);
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
