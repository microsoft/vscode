/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { DeferredPromise, disposableTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_PROVIDER_ID, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IsWebContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IsSessionsWindowContext, RemoteNameContext, WorkbenchStateContext } from '../../../../../common/contextkeys.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatSessionPosition, getResourceForNewChatSession, openChatSession } from '../../chatSessions/chatSessions.contribution.js';
import { IChatViewHostService } from '../../chatViewHost.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { getSessionIsolationProperty } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';


/** How long a new chat in a worktree waits for its session's configuration, as the agent host connects and answers. */
const CONFIGURATION_READY_TIMEOUT = 10_000;

/**
 * Where the entries apply: a window whose agent host is available, as it is on desktop with AI features on, and that is not
 * remote, whose agent host would be the remote's, nor the Agents window, which starts its sessions itself.
 */
const localAgentHostWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
	IsWebContext.negate(),
	RemoteNameContext.isEqualTo(''),
	IsSessionsWindowContext.negate(),
);

/**
 * The resource of a new, not yet shown, chat of the local agent host that starts in a new worktree, which it asks for from
 * its first configuration on: before anything shows it, so that it shows and sends so. Only where the session's
 * configuration, prepared first, offers one; otherwise it reports that and returns `undefined`, rather than a chat that
 * works in the folder. It waits for the configuration as the agent host connects and answers, up to `timeout`, and no
 * longer once `token` is cancelled or the new chat is forgotten meanwhile, which then reports nothing.
 */
export async function prepareNewAgentHostChat(
	resource: URI,
	folderService: IAgentHostNewSessionFolderService,
	provisional: IAgentHostUntitledProvisionalSessionService,
	connectionsService: Pick<IAgentHostConnectionsService, 'onDidChangeSessionResolution'>,
	notificationService: INotificationService,
	token: CancellationToken = CancellationToken.None,
	timeout = CONFIGURATION_READY_TIMEOUT,
): Promise<URI | undefined> {
	folderService.setNewWorktree(resource);
	await waitForPreparedConfig(resource, folderService, provisional, connectionsService, token, timeout);
	if (token.isCancellationRequested || !folderService.isNewWorktree(resource)) {
		abandonNewAgentHostChat(resource, folderService, provisional);
		return undefined;
	}
	const config = provisional.getPreparedSessionConfig(resource);
	const isolation = config && getSessionIsolationProperty(config.schema);
	if (isolation && (isolation.schema.enum ?? []).includes('worktree') && config.values[isolation.key] === 'worktree') {
		return resource;
	}
	abandonNewAgentHostChat(resource, folderService, provisional);
	notificationService.warn(config
		? localize('chat.newChatInWorktree.unsupported', "A new chat cannot work in a new worktree of this folder.")
		: localize('chat.newChatInWorktree.notReady', "A new chat in a worktree could not be prepared. Try again, or choose New Worktree in a new chat."));
	return undefined;
}

/**
 * Prepares the configuration of `resource`, again each time the agent host's session resolution changes, such as as it
 * connects, until it is prepared, `timeout` passes, `token` is cancelled, or the new chat is forgotten.
 */
async function waitForPreparedConfig(
	resource: URI,
	folderService: IAgentHostNewSessionFolderService,
	provisional: IAgentHostUntitledProvisionalSessionService,
	connectionsService: Pick<IAgentHostConnectionsService, 'onDidChangeSessionResolution'>,
	token: CancellationToken,
	timeout: number,
): Promise<void> {
	const store = new DisposableStore();
	const cts = store.add(new CancellationTokenSource(token));
	const done = new DeferredPromise<void>();
	const settled = () => !!provisional.getPreparedSessionConfig(resource) || !folderService.isNewWorktree(resource);
	const check = () => {
		if (settled()) {
			done.complete();
		}
	};
	const prepare = async () => {
		try {
			await provisional.prepareSessionConfig(resource, cts.token);
		} catch (error) {
			onUnexpectedError(error);
		}
		check();
	};
	try {
		store.add(provisional.onDidChange(changed => isEqual(changed, resource) && check()));
		store.add(folderService.onDidChangeFolder(changed => isEqual(changed, resource) && check()));
		store.add(connectionsService.onDidChangeSessionResolution(() => void prepare()));
		store.add(cts.token.onCancellationRequested(() => done.complete()));
		store.add(disposableTimeout(() => done.complete(), timeout));
		void prepare();
		await done.p;
	} finally {
		cts.cancel();
		store.dispose();
	}
}

/**
 * Forgets a new chat that no chat model took: where it was to start, and its prepared configuration with the connection it
 * holds, which nothing else would release, as no model of it goes.
 */
export function abandonNewAgentHostChat(resource: URI, folderService: IAgentHostNewSessionFolderService, provisional: IAgentHostUntitledProvisionalSessionService): void {
	folderService.clear(resource);
	provisional.releaseSession(resource);
}

/**
 * Opens `resource`, prepared by {@link prepareNewAgentHostChat}, with `open`; forgets it where that fails or opens nothing,
 * so that no chat model took it.
 */
export async function openPreparedAgentHostChat(resource: URI, open: () => Promise<URI | undefined>, folderService: IAgentHostNewSessionFolderService, provisional: IAgentHostUntitledProvisionalSessionService): Promise<URI | undefined> {
	let opened: URI | undefined;
	try {
		opened = await open();
	} finally {
		if (!opened) {
			abandonNewAgentHostChat(resource, folderService, provisional);
		}
	}
	return opened;
}

export class NewChatInWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.newChatInWorktree';
	constructor() {
		super({
			id: NewChatInWorktreeAction.ID,
			title: localize2('chat.newChatInWorktree', "New Chat in Worktree"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatNewMenu,
				group: '1_open',
				order: 2,
				// With worktree support, in a window with a single local folder
				when: ContextKeyExpr.and(
					localAgentHostWhen,
					ContextKeyExpr.equals(`config.${ChatConfiguration.EditorWindowEnableWorktree}`, true),
					WorkbenchStateContext.isEqualTo('folder'),
				),
			}],
		});
	}

	/**
	 * Starts a new chat of the local agent host in a new worktree of the window's folder, where New Chat starts its chats:
	 * in the host that replaces the Chat view, such as the chat part, where it takes it, else in the Chat view. Resolves to
	 * the chat it opens in the Chat view; `undefined` where the host starts it, or where it cannot.
	 */
	override async run(accessor: ServicesAccessor): Promise<URI | undefined> {
		const contribution = accessor.get(IChatSessionsService).getChatSessionContribution(SessionType.AgentHostCopilot);
		const enablementService = accessor.get(IAgentHostEnablementService);
		const notificationService = accessor.get(INotificationService);
		const instantiationService = accessor.get(IInstantiationService);
		const folderService = accessor.get(IAgentHostNewSessionFolderService);
		const provisional = accessor.get(IAgentHostUntitledProvisionalSessionService);
		const connectionsService = accessor.get(IAgentHostConnectionsService);
		const chatViewHostService = accessor.get(IChatViewHostService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		if (!contribution || !enablementService.enabled.get()) {
			notificationService.warn(localize('chat.newAgentHostChat.unavailable', "A new chat cannot start here, as the agent host is not available in this window."));
			return undefined;
		}
		const folder = workspaceContextService.getWorkspace().folders.at(0)?.uri;
		// As New Chat: a host that replaces the Chat view starts it, of the local agent host, whatever session type its
		// new chats start with otherwise. Where none does or it does not take it, the Chat view does, prepared here: not as
		// a new chat of its own (`ownChat`), which the service would leave to the Chat view's default new chat.
		if (folder && chatViewHostService.replaced.get() && await chatViewHostService.newChat({
			folder,
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionType: contribution.type.slice(LOCAL_AGENT_HOST_SCHEME_PREFIX.length),
			placement: 'worktree',
		})) {
			return undefined;
		}
		const openOptions = { type: contribution.type, displayName: contribution.displayName, position: ChatSessionPosition.Sidebar };
		const resource = await prepareNewAgentHostChat(getResourceForNewChatSession(openOptions), folderService, provisional, connectionsService, notificationService);
		return resource && openPreparedAgentHostChat(resource, () => instantiationService.invokeFunction(accessor => openChatSession(accessor, { ...openOptions, sessionResource: resource })), folderService, provisional);
	}
}

registerAction2(NewChatInWorktreeAction);
