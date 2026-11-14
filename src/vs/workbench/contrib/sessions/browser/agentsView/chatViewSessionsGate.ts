/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { sessionsListConfigurationProperties } from '../sessionsConfiguration.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewsRegistry } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { isChatViewSessionsListEnabled } from '../../../chat/common/constants.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { AgentsChatViewHost } from './agentsChatViewHost.js';
import { ChatViewSessionsPane, ChatViewSessionsSurface } from './chatViewSessionsPane.js';

/** The settings of the sessions list and of the sessions it opens, as the Agents window registers them. */
const sessionsListConfiguration: IConfigurationNode = {
	id: 'sessionsList',
	properties: sessionsListConfigurationProperties,
};

/**
 * Shows the sessions of the Agents window in the Chat view of an editor window while {@link isChatViewSessionsListEnabled}:
 * its Sessions section lists them, and it shows their chats and a new-session composer below or beside them.
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

		instantiationService.invokeFunction(accessor => {
			// Not in remote windows, whose Chat view stays as it is
			if (accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				return;
			}
			// The actions of the list and of the sessions it shows, once the Chat view or the chat part first shows
			this.registerOnFirstShown(instantiationService, () => {
				this._register(registerSessionsListActions());
				this._register(registerSessionsListReadStateMenus());
				this._register(registerAgentsViewNewSessionActions());
				this._register(instantiationService.createInstance(SessionsArchiveActionsContribution));
			});
			// The chat part, where the chats of sessions can open too
			this._register(instantiationService.createInstance(AgentsChatPartContribution));

			// The chat part docks beside the Chat view, which lists the sessions whose chats it shows
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setChatPartAnchor({ viewId: ChatViewId });
			this._register(toDisposable(() => layoutService.setChatPartAnchor(undefined)));

			const surface = this._register(instantiationService.createInstance(ChatViewSessionsSurface));
			this.replaceChatViewPane(surface);
			this.registerChatViewHost(instantiationService, accessor.get(IChatViewHostService), accessor.get(IViewsService), surface);
		});
	}

	/**
	 * The Chat view shows the sessions and their chats: its pane is replaced as the window starts, before the view is created,
	 * and stays so; the view, with its title and its actions, is the Chat view's.
	 */
	private replaceChatViewPane(surface: ChatViewSessionsSurface): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const chatView = viewsRegistry.getView(ChatViewId);
		const container = viewsRegistry.getViewContainer(ChatViewId);
		if (!chatView || !container) {
			return;
		}
		const replaced = { ...chatView, ctorDescriptor: new SyncDescriptor(ChatViewSessionsPane, [surface]) };
		viewsRegistry.deregisterViews([chatView], container);
		viewsRegistry.registerViews([replaced], container);
		this._register(toDisposable(() => {
			viewsRegistry.deregisterViews([replaced], container);
			viewsRegistry.registerViews([chatView], container);
		}));
	}

	/** What would show the Chat view's chats shows those of the Chat view's sessions, as the chat part does. */
	private registerChatViewHost(instantiationService: IInstantiationService, chatViewHostService: IChatViewHostService, viewsService: IViewsService, surface: ChatViewSessionsSurface): void {
		const host = instantiationService.createChild(new ServiceCollection([IAgentsChatPartService, surface])).createInstance(AgentsChatViewHost);
		this._register(chatViewHostService.registerHost({
			reveal: async preserveFocus => {
				const widget = await host.reveal(preserveFocus);
				if (!widget) {
					// While chat needs setting up, the Chat view shows how to
					await viewsService.openView(ChatViewId, !preserveFocus);
				}
				return widget;
			},
			revealIfShowing: (sessionResource, options) => host.revealIfShowing(sessionResource, options),
			openSession: (sessionResource, options) => host.openSession(sessionResource, options),
			toggle: async () => {
				if (viewsService.isViewVisible(ChatViewId)) {
					viewsService.closeView(ChatViewId);
					return false;
				}
				await viewsService.openView(ChatViewId, true);
				return true;
			},
			startSession: (sessionResource, options) => host.startSession(sessionResource, options),
		}));
		this._register(toDisposable(() => host.deactivate()));
	}

	/** Runs `register` once, as the Chat view or the chat part, which shows sessions too, first shows. */
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
			if (e.id === ChatViewId && e.visible) {
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
			if (viewsService.isViewVisible(ChatViewId) || layoutService.isVisible(Parts.CHAT_PART)) {
				shown();
			}
		});
	}
}
