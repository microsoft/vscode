/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { sessionsListConfiguration } from '../sessionsConfiguration.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatViewOpenKeybindings } from '../../../chat/browser/chat.js';
import { CHAT_OPEN_ACTION_ID } from '../../../chat/browser/actions/chatActions.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { registerSessionsListActions, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { ISessionsViewOptions, SessionsView, SessionsViewId } from '../views/sessionsView.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AGENTS_VIEW_CONTAINER_ID, AGENTS_VIEW_LOADING_VIEW_ID, AGENTS_VIEW_SETUP_VIEW_ID, AgentsViewAvailable, AgentsViewNeedsSetup, AgentsViewStateReadyContext, AgentsViewWhen } from './agentsView.js';
import { AgentsViewSetupPane } from './agentsViewSetupPane.js';
import { AgentsViewLoadingPane } from './agentsViewLoadingPane.js';

const AGENTS_VIEW_TITLE = localize2('agentsView.title', "Sessions");

/** The container of the Sessions view in an editor window, whose title shows the actions of the sessions header. */
class AgentsViewPaneContainer extends ViewPaneContainer {

	private _workspaceFolders: IObservable<readonly URI[]> | undefined;

	/** The folders of the window's workspace, to which the list scopes its sessions; none in an empty window. */
	private get workspaceFolders(): IObservable<readonly URI[]> {
		this._workspaceFolders ??= observableFromEvent(this, this.contextService.onDidChangeWorkspaceFolders, () => this.contextService.getWorkspace().folders.map(folder => folder.uri));
		return this._workspaceFolders;
	}

	protected override createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewPane {
		const sessionsViewOptions: IViewletViewOptions & ISessionsViewOptions = { ...options, headerInTitle: true, showCustomizations: false, scopeFolders: this.workspaceFolders };
		return super.createView(viewDescriptor, sessionsViewOptions);
	}
}

/**
 * Shows the Sessions view of the Agents window in an editor window while {@link ChatConfiguration.AgentsViewEnabled} is on.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class AgentsViewGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (configurationService.getValue<boolean>(ChatConfiguration.AgentsViewEnabled) !== true) {
			return;
		}

		this.registerView();

		// The settings of the list and of the sessions it opens, as the Agents window has them
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration(sessionsListConfiguration);
		this._register(toDisposable(() => configurationRegistry.deregisterConfigurations([sessionsListConfiguration])));
		// The actions of the list and of the sessions it shows, once the Sessions view or the chat part first shows. The state
		// the list shares with the Agents window loads as the first of them needs it.
		this.registerOnFirstShown(instantiationService, () => {
			this._register(registerSessionsListActions());
			this._register(instantiationService.createInstance(SessionsArchiveActionsContribution));
		});

		instantiationService.invokeFunction(accessor => {
			// The chat part, where sessions open: not in remote windows, where the Sessions view does not show
			if (!accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				this._register(instantiationService.createInstance(AgentsChatPartContribution));
				this.replaceChatView(accessor.get(IContextKeyService), accessor.get(IWorkbenchLayoutService), accessor.get(IPaneCompositePartService), accessor.get(ILifecycleService));
			}
		});
	}

	/**
	 * The chat part replaces the Chat view: the Chat view does not show (`ChatContextKeys.agentsViewActive`), the keys that
	 * open it open the chat part, and the Secondary Side Bar, which shows the Chat view by default, does not show empty.
	 */
	private replaceChatView(contextKeyService: IContextKeyService, layoutService: IWorkbenchLayoutService, paneCompositeService: IPaneCompositePartService, lifecycleService: ILifecycleService): void {
		ChatContextKeys.agentsViewActive.bindTo(contextKeyService).set(true);

		this._register(KeybindingsRegistry.registerKeybindingRule({
			...ChatViewOpenKeybindings,
			id: CHAT_OPEN_ACTION_ID,
			// Over the Chat view's own
			weight: KeybindingWeight.WorkbenchContrib + 1,
			when: ChatContextKeys.agentsViewActive,
		}));

		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (!this._store.isDisposed && layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !paneCompositeService.getVisiblePaneCompositeIds(ViewContainerLocation.AuxiliaryBar).length) {
				layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
		});
	}

	/** Runs `register` once, as the Sessions view or the chat part, which shows sessions too, first shows. */
	private registerOnFirstShown(instantiationService: IInstantiationService, register: () => void): void {
		const { viewsService, layoutService, lifecycleService } = instantiationService.invokeFunction(accessor => ({
			viewsService: accessor.get(IViewsService),
			layoutService: accessor.get(IWorkbenchLayoutService),
			lifecycleService: accessor.get(ILifecycleService),
		}));
		const firstShown = this._register(new DisposableStore());
		const shown = () => {
			if (!firstShown.isDisposed) {
				firstShown.dispose();
				register();
			}
		};
		firstShown.add(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === SessionsViewId && e.visible) {
				shown();
			}
		}));
		firstShown.add(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART && e.visible) {
				shown();
			}
		}));
		// Either restores shown with the window, without a change of its visibility
		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (viewsService.isViewVisible(SessionsViewId) || layoutService.isVisible(Parts.CHAT_PART)) {
				shown();
			}
		});
	}

	private registerView(): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const container = viewContainersRegistry.registerViewContainer({
			id: AGENTS_VIEW_CONTAINER_ID,
			title: AGENTS_VIEW_TITLE,
			icon: Codicon.agent,
			// Before the Explorer, until the user moves it: the activity bar keeps where it is from then on
			order: -1,
			ctorDescriptor: new SyncDescriptor(AgentsViewPaneContainer, [AGENTS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: AGENTS_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			windowEnablement: WindowEnablement.Editor,
		}, ViewContainerLocation.Sidebar);
		this._register(toDisposable(() => viewContainersRegistry.deregisterViewContainer(container)));

		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const view: IViewDescriptor = {
			id: SessionsViewId,
			name: AGENTS_VIEW_TITLE,
			containerIcon: Codicon.agent,
			containerTitle: AGENTS_VIEW_TITLE.value,
			singleViewPaneContainerTitle: AGENTS_VIEW_TITLE.value,
			ctorDescriptor: new SyncDescriptor(SessionsView),
			canToggleVisibility: false,
			canMoveView: false,
			when: AgentsViewWhen,
			windowEnablement: WindowEnablement.Editor,
		};
		const loadingView: IViewDescriptor = {
			id: AGENTS_VIEW_LOADING_VIEW_ID,
			name: AGENTS_VIEW_TITLE,
			containerIcon: Codicon.agent,
			containerTitle: AGENTS_VIEW_TITLE.value,
			singleViewPaneContainerTitle: AGENTS_VIEW_TITLE.value,
			ctorDescriptor: new SyncDescriptor(AgentsViewLoadingPane),
			canToggleVisibility: false,
			canMoveView: false,
			when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewStateReadyContext.negate(), AgentsViewNeedsSetup.negate()),
			windowEnablement: WindowEnablement.Editor,
		};
		// Signing in, which the Chat view offered before the chat part replaced it
		const setupView: IViewDescriptor = {
			id: AGENTS_VIEW_SETUP_VIEW_ID,
			name: AGENTS_VIEW_TITLE,
			containerIcon: Codicon.agent,
			containerTitle: AGENTS_VIEW_TITLE.value,
			singleViewPaneContainerTitle: AGENTS_VIEW_TITLE.value,
			ctorDescriptor: new SyncDescriptor(AgentsViewSetupPane),
			canToggleVisibility: false,
			canMoveView: false,
			when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup),
			windowEnablement: WindowEnablement.Editor,
		};
		viewsRegistry.registerViews([view, loadingView, setupView], container);
		this._register(toDisposable(() => viewsRegistry.deregisterViews([view, loadingView, setupView], container)));
		this._register(viewsRegistry.registerViewWelcomeContent(AGENTS_VIEW_SETUP_VIEW_ID, {
			content: localize('agentsView.setup', "Sign in to see your agent sessions and start new ones.\n[Sign In](command:workbench.action.chat.triggerSetup)"),
		}));
	}
}
