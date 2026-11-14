/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationDefaults, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ActiveAuxiliaryContext, AuxiliaryBarMaximizeHiddenContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewContainerId, ChatViewId } from '../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { IChatViewSessionsListService } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { ChatConfiguration, isChatViewSessionsListEnabled } from '../../../chat/common/constants.js';
import { sessionsListConfigurationProperties } from '../sessionsConfiguration.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartService } from './agentsChatPart.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { AgentsChatViewHost } from './agentsChatViewHost.js';
import { ChatViewSessionsListProvider } from './chatViewSessionsList.js';

/** The settings of the sessions list and of the sessions it opens, as the Agents window registers them. */
const sessionsListConfiguration: IConfigurationNode = {
	id: 'sessionsList',
	properties: sessionsListConfigurationProperties,
};

/** The chats of the editor window are those of the sessions of the Agents window: not local chats, which the list does not show. */
const noLocalChatDefaults: IConfigurationDefaults = {
	overrides: { [ChatConfiguration.EditorLocalAgentEnabled]: false },
};

/**
 * Shows the sessions of the Agents window in the Chat view of an editor window while {@link isChatViewSessionsListEnabled}: its
 * sessions section lists them, and a session opens in the Chat view's chat, or in the chat part while
 * `chat.viewSessions.openInChatPart` is on, when the Chat view shows only the sessions.
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

		// The settings of the list and of the sessions it opens, as the Agents window has them, and no local chats by default
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration(sessionsListConfiguration);
		configurationRegistry.registerDefaultConfigurations([noLocalChatDefaults]);
		this._register(toDisposable(() => {
			configurationRegistry.deregisterConfigurations([sessionsListConfiguration]);
			configurationRegistry.deregisterDefaultConfigurations([noLocalChatDefaults]);
		}));

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

			// The chat part, where the chats of sessions open while chat.viewSessions.openInChatPart is on: otherwise it does
			// not show, also not as the window restores it shown, which it hides before the chat part restores its chats
			const openInChatPart = observableConfigValue(ChatConfiguration.ChatViewSessionsOpenInChatPart, false, configurationService);
			this.hideChatPartUnlessUsed(accessor.get(IWorkbenchLayoutService), accessor.get(ILifecycleService), openInChatPart);
			this._register(instantiationService.createInstance(AgentsChatPartContribution));

			// The chat part docks beside the Chat view, which lists the sessions whose chats it shows
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setChatPartAnchor({ viewId: ChatViewId });
			this._register(toDisposable(() => layoutService.setChatPartAnchor(undefined)));

			const chatPart = () => instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartService));
			const chatViewHostService = accessor.get(IChatViewHostService);
			// The sessions list of the Chat view, whose sessions open in the Chat view's chat, or in the chat part
			this._register(accessor.get(IChatViewSessionsListService).registerProvider(new ChatViewSessionsListProvider(openInChatPart, async (session, chatResource, preserveFocus) => {
				if (openInChatPart.get()) {
					await chatPart().openChat(session, chatResource, { preserveFocus });
				} else {
					await chatViewHostService.openSession(chatResource ?? session.mainChat.get().resource, { preserveFocus });
				}
			}, chatPart)));
			this.registerChatPartHost(instantiationService, chatViewHostService, openInChatPart);
			this.hideMaximizeWhileInChatPart(accessor.get(IContextKeyService), openInChatPart);
		});
	}

	/**
	 * While the chats open in the chat part, what would show the Chat view's chats shows them in the chat part, as the Agents
	 * view does; otherwise the Chat view shows them, as it does without the sessions.
	 */
	private registerChatPartHost(instantiationService: IInstantiationService, chatViewHostService: IChatViewHostService, openInChatPart: IObservable<boolean>): void {
		const registration = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			if (!openInChatPart.read(reader)) {
				registration.clear();
				return;
			}
			const host = instantiationService.createInstance(AgentsChatViewHost);
			registration.value = chatViewHostService.registerHost({
				reveal: preserveFocus => host.reveal(preserveFocus),
				revealIfShowing: (sessionResource, options) => host.revealIfShowing(sessionResource, options),
				openSession: (sessionResource, options) => host.openSession(sessionResource, options),
				toggle: () => host.toggle(),
				startSession: (sessionResource, options) => host.startSession(sessionResource, options),
				// New Chat, such as + in the title of the Chat view, opens a new-session composer in the chat part
				newChat: () => {
					const target = instantiationService.invokeFunction(accessor => getAgentsChatPartComposerTarget(accessor.get(IWorkspaceContextService), accessor.get(IEditorService)));
					instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartService)).openComposer(target, { newComposer: true }).catch(onUnexpectedError);
					return true;
				},
			});
			// Unregistered, what the host is still doing does not open the chat part
			reader.store.add(toDisposable(() => host.deactivate()));
		}));
	}

	/** While the Chat view shows only the sessions, whose chats open in the chat part, the secondary side bar does not offer to maximize it. */
	private hideMaximizeWhileInChatPart(contextKeyService: IContextKeyService, openInChatPart: IObservable<boolean>): void {
		const hidden = AuxiliaryBarMaximizeHiddenContext.bindTo(contextKeyService);
		const activeAuxiliary = observableFromEvent(this, Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([ActiveAuxiliaryContext.key]))), () => contextKeyService.getContextKeyValue<string>(ActiveAuxiliaryContext.key));
		this._register(autorun(reader => hidden.set(openInChatPart.read(reader) && activeAuxiliary.read(reader) === ChatViewContainerId)));
		this._register(toDisposable(() => hidden.reset()));
	}

	/** Hides the chat part while the chats open in the Chat view: as the window is ready, and as they stop opening in the chat part. */
	private hideChatPartUnlessUsed(layoutService: IWorkbenchLayoutService, lifecycleService: ILifecycleService, openInChatPart: IObservable<boolean>): void {
		void lifecycleService.when(LifecyclePhase.Ready).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._register(autorun(reader => {
				if (!openInChatPart.read(reader) && layoutService.isVisible(Parts.CHAT_PART)) {
					layoutService.setPartHidden(true, Parts.CHAT_PART);
				}
			}));
		});
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
