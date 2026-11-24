/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from '../../../chat/browser/agentSessions/agentSessions.js';
import { HideAgentSessionsSidebar, ShowAgentSessionsSidebar } from '../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { registerAgentsViewNewSessionActions } from '../agentsView/agentsChatPartActions.js';
import { ChatViewSessionsListProvider } from '../agentsView/chatViewSessionsList.js';
import { IEditorWindowShownChatService } from '../agentsView/editorWindowMainSessionHost.js';
import { EditorWindowSessionsList } from '../agentsView/editorWindowSessionsList.js';
import { ChatViewSessionsListContext, ChatViewSessionsListTitleContext } from '../views/sessionsView.js';
import { registerSessionsListAccessibilityHelp } from '../views/sessionsListActions.js';
import { ChatViewSessionsListAccessibilityHelp } from './chatViewSessionsListAccessibilityHelp.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { Menus } from '../menus.js';
import { ShownChatReadMarker } from '../shownChatReadMarker.js';
import { IChatViewSessionsListService } from '../../../chat/common/chatViewSessionsListService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.ChatViewSessionsListEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.sessionsList.enabled', "Controls whether the Chat view of editor windows shows the sessions of the Agents window, with their chats, in place of its own chats. Local chats are not available while it is on."),
		},
	},
});

/** Whether the Chat view shows only its sessions, whose chats show elsewhere, such as in the chat part. */
const ChatViewSessionsOnlyContext = new RawContextKey<boolean>('chatViewSessionsOnly', false);

/**
 * Shows the sessions of the Agents window in the Chat view of an editor window while {@link IChatViewSessionsListService.enabled}:
 * its sessions section lists them, and they open where the window presents its sessions: in the Chat view's chat, or in the
 * chat part while a feature enabled it, when the Chat view shows only the sessions. It follows the setting live: as it turns
 * off, everything it registered goes, and the Chat view shows its own sessions again. With it off, this creates no service.
 */
export class ChatViewSessionsGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewSessionsGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IChatViewSessionsListService chatViewSessionsListService: IChatViewSessionsListService,
	) {
		super();

		// Not in remote windows, whose Chat view stays as it is
		if (environmentService.remoteAuthority) {
			return;
		}

		// Accessibility help of the list and of its Undo notice, whether the setting is on or turns on later: help registered
		// after the window's accessibility help installs what is registered, eventually, would not be installed. They help only
		// where the list has focus, and create nothing.
		this._register(registerSessionsListAccessibilityHelp());
		this._register(AccessibleViewRegistry.register(instantiationService.createInstance(ChatViewSessionsListAccessibilityHelp)));

		const enabled = chatViewSessionsListService.enabled;
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(instantiationService.createInstance(ChatViewSessionsListFeature));
			}
		}));
	}
}

/** What shows the sessions of the Agents window in the Chat view, while {@link ChatViewSessionsGate} enables it. */
class ChatViewSessionsListFeature extends Disposable {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorWindowSessionsRuntime sessionsRuntime: IEditorWindowSessionsRuntime,
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IEditorWindowShownChatService private readonly _shownChatService: IEditorWindowShownChatService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();

		// The sessions providers, held while the Chat view, which lists their sessions, shows
		this._register(sessionsRuntime.enable({ viewIds: [ChatViewId] }));
		// The settings and the actions of the shared sessions list, once the Chat view first shows it
		this._register(instantiationService.createInstance(EditorWindowSessionsList, () => registerAgentsViewNewSessionActions(), ChatViewId));

		// The sessions list of the Chat view, whose sessions open where the window presents them. While a host replaces the Chat
		// view, such as the chat part, its chats show there: the Chat view shows only the sessions, unless it hosts the chat
		// opened last, one that the host leaves to it, such as a local chat
		this._register(_chatViewHostService.register({ sessionsList: instantiationService.createInstance(ChatViewSessionsListProvider), sessionsOnly: true }));
		const sessionsOnly = _chatViewHostService.sessionsOnly;
		const sessionsOnlyContext = ChatViewSessionsOnlyContext.bindTo(contextKeyService);
		this._register(autorun(reader => sessionsOnlyContext.set(sessionsOnly.read(reader))));
		this._register(toDisposable(() => sessionsOnlyContext.reset()));

		const sessionsListContext = ChatViewSessionsListContext.bindTo(contextKeyService);
		sessionsListContext.set(true);
		this._register(toDisposable(() => sessionsListContext.reset()));

		this._register(registerSessionsSidebarToggle());
		this.showChatViewChat(sessionsOnly);
	}

	/**
	 * While the chats open in the Chat view, the chat it shows is the chat of the window, as the active tab's chat of the chat
	 * part is otherwise: what the editors of the window show of a session, such as the Changes editor, and the active session
	 * of the sessions list, are of it. It is marked read while the Chat view shows it.
	 */
	private showChatViewChat(sessionsOnly: IObservable<boolean>): void {
		// The Agents window shows the chats of its own session host
		if (this._environmentService.isSessionsWindow) {
			return;
		}
		const sessionsManagementService = this._sessionsManagementService;
		const chatViewHostService = this._chatViewHostService;
		const viewsService = this._viewsService;
		// Of every session, also one outside the list's scope, such as the session of a peer chat whose ownership arrives later
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSession);
		const shown = derived(this, reader => {
			const shownSession = chatViewHostService.shownSession.read(reader);
			if (!shownSession) {
				return undefined;
			}
			sessionsChanged.read(reader);
			return sessionsManagementService.getSessionForChatResource(shownSession.resource);
		});
		this._register(autorun(reader => {
			if (!sessionsOnly.read(reader)) {
				reader.store.add(this._shownChatService.bind(shown, { override: true }));
			}
		}));

		const chatViewVisible = observableFromEvent(this, Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === ChatViewId), () => viewsService.isViewVisible(ChatViewId));
		const readMarker = new ShownChatReadMarker(sessionsManagementService, this._uriIdentityService.extUri);
		this._register(autorun(reader => {
			const visible = !sessionsOnly.read(reader) && chatViewVisible.read(reader) ? shown.read(reader) : undefined;
			if (visible) {
				readMarker.update(visible.session, visible.chat, reader);
			} else {
				readMarker.reset();
			}
		}));
	}
}

/**
 * Shows and hides the sessions beside the chat of the Chat view from the header of its sessions, as the Chat view's own sessions
 * header does: while the Chat view shows its chat, not while it shows only the sessions.
 */
function registerSessionsSidebarToggle(): IDisposable {
	const store = new DisposableStore();
	const inChatView = ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ChatViewSessionsOnlyContext.negate());
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
		store.add(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			command: { ...item.command, icon: item.icon },
			group: 'navigation',
			order: 100,
			when: ContextKeyExpr.and(ChatViewSessionsListTitleContext, ChatViewSessionsOnlyContext.negate(), ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(item.orientation), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(item.position)),
		}));
	}
	return store;
}

registerWorkbenchContribution2(ChatViewSessionsGate.ID, ChatViewSessionsGate, WorkbenchPhase.AfterRestored);
