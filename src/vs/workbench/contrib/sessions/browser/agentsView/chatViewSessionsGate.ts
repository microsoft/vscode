/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { sessionsListConfigurationProperties } from '../sessionsConfiguration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { ISessionsViewOptions, SessionsView, SessionsViewId } from '../views/sessionsView.js';
import { ChatViewContainerId } from '../../../chat/browser/chat.js';
import { AgentsViewWhen } from './agentsView.js';
import { isChatViewSessionsListEnabled } from '../../../chat/common/constants.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';

/** The settings of the sessions list and of the sessions it opens, as the Agents window registers them. */
const sessionsListConfiguration: IConfigurationNode = {
	id: 'sessionsList',
	properties: sessionsListConfigurationProperties,
};

const SESSIONS_VIEW_TITLE = localize2('chatViewSessions.title', "Sessions");

/** The services of the Sessions view, which its constructor takes after its options. */
type SessionsViewServices = ConstructorParameters<typeof SessionsView> extends [ISessionsViewOptions, ...infer Services] ? Services : never;

/**
 * The Sessions view as it shows in the Chat view container: the actions of its header in its title, without the
 * customizations, and listing the sessions of the window's folders only, while it has folders (`scoped`).
 */
function createChatViewSessionsView(scoped: IObservable<boolean>): typeof SessionsView {
	return class ChatViewSessionsView extends SessionsView {
		constructor(options: IViewletViewOptions, ...services: SessionsViewServices) {
			super({ ...options, headerInTitle: true, showCustomizations: false, scoped }, ...services);
		}
	};
}

/**
 * Shows the Agents view, with the sessions of the Agents window, in place of the Chat view of an editor window while {@link isChatViewSessionsListEnabled}.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class ChatViewSessionsGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewSessionsGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (!isChatViewSessionsListEnabled(configurationService)) {
			return;
		}

		// The settings of the list and of the sessions it opens, as the Agents window has them
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration(sessionsListConfiguration);
		this._register(toDisposable(() => configurationRegistry.deregisterConfigurations([sessionsListConfiguration])));
		// The actions of the list and of the sessions it shows, once the Sessions view or the chat part first shows
		this.registerOnFirstShown(instantiationService, () => {
			this._register(registerSessionsListActions());
			this._register(registerSessionsListReadStateMenus());
			this._register(registerAgentsViewNewSessionActions());
			this._register(instantiationService.createInstance(SessionsArchiveActionsContribution));
		});

		instantiationService.invokeFunction(accessor => {
			// The chat part, where sessions open: not in remote windows, where the Sessions view does not show
			if (!accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				this._register(instantiationService.createInstance(AgentsChatPartContribution));
				this.registerView(accessor.get(IWorkspaceContextService));
				this.replaceChatView(accessor.get(IContextKeyService));
			}
		});
	}

	/** Registers the Sessions view in the Chat view container, where it shows in place of the Chat view. */
	private registerView(workspaceContextService: IWorkspaceContextService): void {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(ChatViewContainerId);
		if (!container) {
			return;
		}
		const scoped = observableFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.length > 0);
		const view: IViewDescriptor = {
			id: SessionsViewId,
			name: SESSIONS_VIEW_TITLE,
			containerIcon: container.icon,
			containerTitle: container.title.value,
			singleViewPaneContainerTitle: SESSIONS_VIEW_TITLE.value,
			ctorDescriptor: new SyncDescriptor(createChatViewSessionsView(scoped)),
			canToggleVisibility: false,
			canMoveView: false,
			when: ChatContextKeys.agentsViewActive,
			windowEnablement: WindowEnablement.Editor,
		};
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		viewsRegistry.registerViews([view], container);
		this._register(toDisposable(() => viewsRegistry.deregisterViews([view], container)));
	}

	/**
	 * The Sessions view replaces the Chat view (`ChatContextKeys.agentsViewActive`) where it shows: not while chat needs
	 * signing in or setting up, which the Chat view offers, as it does today.
	 */
	private replaceChatView(contextKeyService: IContextKeyService): void {
		const active = ChatContextKeys.agentsViewActive.bindTo(contextKeyService);
		const keys = new Set(AgentsViewWhen.keys());
		const update = () => active.set(contextKeyService.contextMatchesRules(AgentsViewWhen));
		update();
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(keys)) {
				update();
			}
		}));
		this._register(toDisposable(() => active.reset()));
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
}
