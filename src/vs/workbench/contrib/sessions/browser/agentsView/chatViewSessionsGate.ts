/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from '../../../chat/browser/agentSessions/agentSessions.js';
import { HideAgentSessionsSidebar, ShowAgentSessionsSidebar } from '../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { Menus } from '../menus.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationDefaults, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ShownChatReadMarker } from '../shownChatReadMarker.js';
import { EditorWindowMainSessionHost } from './editorWindowMainSessionHost.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ActiveAuxiliaryContext, AuxiliaryBarMaximizeHiddenContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatViewContainerId, ChatViewId } from '../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { IChatViewSessionsListService } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { ChatConfiguration, isChatViewSessionsListEnabled } from '../../../chat/common/constants.js';
import { registerEditorWindowSessionsList } from './editorWindowSessionsList.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartService } from './agentsChatPart.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { AgentsChatViewHost } from './agentsChatViewHost.js';
import { ChatViewSessionsListProvider } from './chatViewSessionsList.js';

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

		instantiationService.invokeFunction(accessor => {
			// Not in remote windows, whose Chat view stays as it is
			if (accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				return;
			}

			// No local chats by default, which the list does not show
			const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
			configurationRegistry.registerDefaultConfigurations([noLocalChatDefaults]);
			this._register(toDisposable(() => configurationRegistry.deregisterDefaultConfigurations([noLocalChatDefaults])));

			// The settings and the actions of the shared sessions list, once the Chat view, which shows it, or the chat part first shows
			this._register(registerEditorWindowSessionsList(instantiationService, () => registerAgentsViewNewSessionActions(), ChatViewId));

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
			this._register(registerSessionsSidebarToggle());
			this.hideMaximizeWhileInChatPart(accessor.get(IContextKeyService), openInChatPart);
			this.showChatViewChat(accessor, openInChatPart);
		});
	}

	/**
	 * While the chats open in the Chat view, the chat it shows is the chat of the window, as the active tab's chat of the chat
	 * part is otherwise: what the editors of the window show of a session, such as the Changes editor, and the active session
	 * of the sessions list, are of it. It is marked read while the Chat view shows it.
	 */
	private showChatViewChat(accessor: ServicesAccessor, openInChatPart: IObservable<boolean>): void {
		const sessionHost = accessor.get(ISessionHost);
		if (!(sessionHost instanceof EditorWindowMainSessionHost)) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const chatViewHostService = accessor.get(IChatViewHostService);
		const viewsService = accessor.get(IViewsService);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		const shown = derived(this, reader => {
			const shownSession = chatViewHostService.shownSession.read(reader);
			if (!shownSession) {
				return undefined;
			}
			sessionsChanged.read(reader);
			return sessionsManagementService.getSessionForChatResource(shownSession.resource);
		});
		this._register(autorun(reader => {
			if (!openInChatPart.read(reader)) {
				reader.store.add(sessionHost.overrideShownChat(shown));
			}
		}));

		const chatViewVisible = observableFromEvent(this, Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === ChatViewId), () => viewsService.isViewVisible(ChatViewId));
		const readMarker = new ShownChatReadMarker(sessionsManagementService, accessor.get(IUriIdentityService).extUri);
		this._register(autorun(reader => {
			const visible = !openInChatPart.read(reader) && chatViewVisible.read(reader) ? shown.read(reader) : undefined;
			if (visible) {
				readMarker.update(visible.session, visible.chat, reader);
			} else {
				readMarker.reset();
			}
		}));
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
}

/**
 * Shows and hides the sessions beside the chat of the Chat view from the header of its sessions, as the Chat view's own sessions
 * header does: while the chats open in the Chat view, not while the Chat view shows only the sessions.
 */
function registerSessionsSidebarToggle(): IDisposable {
	const store = new DisposableStore();
	const inChatView = ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.notEquals(`config.${ChatConfiguration.ChatViewSessionsOpenInChatPart}`, true));
	const items: { readonly command: { readonly id: string; readonly title: ILocalizedString }; readonly icon: ThemeIcon; readonly orientation: AgentSessionsViewerOrientation; readonly position: AgentSessionsViewerPosition }[] = [
		{ command: { id: ShowAgentSessionsSidebar.ID, title: ShowAgentSessionsSidebar.TITLE }, icon: Codicon.layoutSidebarRightOff, orientation: AgentSessionsViewerOrientation.Stacked, position: AgentSessionsViewerPosition.Right },
		{ command: { id: ShowAgentSessionsSidebar.ID, title: ShowAgentSessionsSidebar.TITLE }, icon: Codicon.layoutSidebarLeftOff, orientation: AgentSessionsViewerOrientation.Stacked, position: AgentSessionsViewerPosition.Left },
		{ command: { id: HideAgentSessionsSidebar.ID, title: HideAgentSessionsSidebar.TITLE }, icon: Codicon.layoutSidebarRight, orientation: AgentSessionsViewerOrientation.SideBySide, position: AgentSessionsViewerPosition.Right },
		{ command: { id: HideAgentSessionsSidebar.ID, title: HideAgentSessionsSidebar.TITLE }, icon: Codicon.layoutSidebarLeft, orientation: AgentSessionsViewerOrientation.SideBySide, position: AgentSessionsViewerPosition.Left },
	];
	for (const item of items) {
		store.add(MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
			command: { ...item.command, icon: item.icon },
			group: 'navigation',
			order: 100,
			when: ContextKeyExpr.and(inChatView, ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(item.orientation), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(item.position)),
		}));
	}
	return store;
}
