/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsview.css';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NEW_CHAT_SESSION_ACTION_ID } from '../chatSessions/common.js';
import { ACTION_ID_OPEN_CHAT } from '../actions/chatActions.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { AgentSessionProviders } from './agentSessions.js';
import { AgentSessionsFilter } from './agentSessionsFilter.js';
import { AgentSessionsControl } from './agentSessionsControl.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

type AgentSessionsViewPaneOpenedClassification = {
	owner: 'bpasero';
	comment: 'Event fired when the agent sessions pane is opened';
};

export class AgentSessionsView extends ViewPane {

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
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@IMenuService private readonly menuService: IMenuService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super({ ...options, titleMenuId: MenuId.AgentSessionsViewTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.registerListeners();
	}

	private registerListeners(): void {
		const sessionsModel = this.agentSessionsService.model;
		const didResolveDisposable = this._register(new MutableDisposable());
		this._register(sessionsModel.onWillResolve(() => {
			const didResolve = new DeferredPromise<void>();
			didResolveDisposable.value = Event.once(sessionsModel.onDidResolve)(() => didResolve.complete());

			this.progressService.withProgress(
				{
					location: this.id,
					title: localize('agentSessions.refreshing', 'Refreshing agent sessions...'),
					delay: 500
				},
				() => didResolve.p
			);
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.telemetryService.publicLog2<{}, AgentSessionsViewPaneOpenedClassification>('agentSessionsViewPaneOpened');

		container.classList.add('agent-sessions-view');

		// New Session
		this.createNewSessionButton(container);

		// Sessions Control
		this.createSessionsControl(container);
	}

	//#region New Session Controls

	private newSessionContainer: HTMLElement | undefined;

	private createNewSessionButton(container: HTMLElement): void {
		this.newSessionContainer = append(container, $('.agent-sessions-new-session-container'));

		const newSessionButton = this._register(new ButtonWithDropdown(this.newSessionContainer, {
			title: localize('agentSessions.newSession', "New Session"),
			ariaLabel: localize('agentSessions.newSessionAriaLabel', "New Session"),
			contextMenuProvider: this.contextMenuService,
			actions: {
				getActions: () => {
					return this.getNewSessionActions();
				}
			},
			addPrimaryActionToDropdown: false,
			...defaultButtonStyles,
		}));

		newSessionButton.label = localize('agentSessions.newSession', "New Session");

		this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_OPEN_CHAT)));
	}

	private getNewSessionActions(): IAction[] {
		const actions: IAction[] = [];

		// Default action
		actions.push(toAction({
			id: 'newChatSession.default',
			label: localize('newChatSessionDefault', "New Local Session"),
			run: () => this.commandService.executeCommand(ACTION_ID_OPEN_CHAT)
		}));

		// Background (CLI)
		actions.push(toAction({
			id: 'newChatSessionFromProvider.background',
			label: localize('newBackgroundSession', "New Background Session"),
			run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${AgentSessionProviders.Background}`)
		}));

		// Cloud
		actions.push(toAction({
			id: 'newChatSessionFromProvider.cloud',
			label: localize('newCloudSession', "New Cloud Session"),
			run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${AgentSessionProviders.Cloud}`)
		}));

		let addedSeparator = false;
		for (const provider of this.chatSessionsService.getAllChatSessionContributions()) {
			if (provider.type === AgentSessionProviders.Background || provider.type === AgentSessionProviders.Cloud) {
				continue; // already added above
			}

			if (!addedSeparator) {
				actions.push(new Separator());
				addedSeparator = true;
			}

			const menuActions = this.menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, this.scopedContextKeyService.createOverlay([
				[ChatContextKeys.agentSessionType.key, provider.type]
			]));

			const primaryActions = getActionBarActions(menuActions, () => true).primary;

			// Prefer provider creation actions...
			if (primaryActions.length > 0) {
				actions.push(...primaryActions);
			}

			// ...over our generic one
			else {
				actions.push(toAction({
					id: `newChatSessionFromProvider.${provider.type}`,
					label: localize('newChatSessionFromProvider', "New {0}", provider.displayName),
					run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${provider.type}`)
				}));
			}
		}

		// Install more
		const installMenuActions = this.menuService.getMenuActions(MenuId.AgentSessionsInstallMenu, this.scopedContextKeyService, { shouldForwardArgs: true });
		const installActionBar = getActionBarActions(installMenuActions, () => true);
		if (installActionBar.primary.length > 0) {
			actions.push(new Separator());
			actions.push(...installActionBar.primary);
		}

		return actions;
	}

	//#endregion

	//#region Sessions Control

	private sessionsControl: AgentSessionsControl | undefined;

	private createSessionsControl(container: HTMLElement): void {
		const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
			filterMenuId: MenuId.AgentSessionsFilterSubMenu,
		}));

		this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl,
			container,
			{
				filter: sessionsFilter,
				allowNewSessionFromEmptySpace: true,
				allowFiltering: true,
				trackActiveEditor: true,
			}
		));
		this.sessionsControl.setVisible(this.isBodyVisible());

		this._register(this.onDidChangeBodyVisibility(visible => {
			this.sessionsControl?.setVisible(visible);
		}));
	}

	//#endregion

	//#region Actions internal API

	openFind(): void {
		this.sessionsControl?.openFind();
	}

	refresh(): void {
		this.sessionsControl?.refresh();
	}

	//#endregion

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		let sessionsControlHeight = height;
		sessionsControlHeight -= this.newSessionContainer?.offsetHeight ?? 0;

		this.sessionsControl?.layout(sessionsControlHeight, width);
	}

	override focus(): void {
		super.focus();

		this.sessionsControl?.focus();
	}
}
