/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isCopilotAgentHostProvider, parseRemoteAgentHostSessionTypeAuthority } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IAgentHostNewSessionLink, parseNewSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatSessionPosition, getResourceForNewChatSession, openChatSession } from '../../chatSessions/chatSessions.contribution.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';

/** How long a link waits for a configured agent host that is still connecting. */
const AGENT_HOST_AVAILABILITY_TIMEOUT_MS = 15_000;

/**
 * Opens `agent-host-session://new?...` links clicked in an editor window as a
 * new agent host chat in this window: with the linked agent on the linked agent
 * host (the local agent host when the link names none), the linked folder as its
 * working directory, and the linked prompt as an unsent draft. The chat opens in
 * the Chat view, or in a chat editor when sessions open in editors.
 *
 * The host must be available to this window, for example through
 * `chat.workspaceRemoteAgentHosts`; the Agents window handles the same links
 * with its own opener.
 */
export class AgentHostNewSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.chat.agentHostNewSessionLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async (resource, options) => {
				const link = parseNewSessionLinkUri(resource);
				if (!link) {
					return false;
				}
				await this._open(link, { openToSide: false, ...options }.openToSide === true);
				return true;
			},
		}));
	}

	private async _open(link: IAgentHostNewSessionLink, openToSide: boolean): Promise<void> {
		const contribution = await this._waitForSessionType(link);
		if (!contribution) {
			this._notificationService.warn(localize('agentHostNewSessionLink.unavailable', "The agent host of this link is not available in this window. Configure it in the '{0}' setting to start sessions on it from here.", 'chat.workspaceRemoteAgentHosts'));
			return;
		}

		const position = openToSide || this._configurationService.getValue<boolean>(ChatConfiguration.OpenSessionsInEditor) ? ChatSessionPosition.Editor : ChatSessionPosition.Sidebar;
		const openOptions = { type: contribution.type, position, displayName: contribution.displayName };
		const sessionResource = getResourceForNewChatSession(openOptions);
		if (link.folderUri) {
			// Carried onto the real session when the first request creates it, and cleared when the chat is disposed.
			this._newSessionFolderService.setFolder(sessionResource, link.folderUri);
		}
		const openedResource = await this._instantiationService.invokeFunction(openChatSession, { ...openOptions, sessionResource });
		if (link.draft) {
			this._chatWidgetService.getWidgetBySessionResource(openedResource ?? sessionResource)?.setInput(link.draft.inputText);
		}
	}

	/** Waits briefly for a configured host whose agents have not been registered yet, for example while it connects. */
	private async _waitForSessionType(link: IAgentHostNewSessionLink): Promise<ResolvedChatSessionsExtensionPoint | undefined> {
		const find = () => findSessionTypeForLink(this._chatSessionsService.getAllChatSessionContributions(), link);
		const found = find();
		if (found) {
			return found;
		}
		const store = new DisposableStore();
		const timer = timeout(AGENT_HOST_AVAILABILITY_TIMEOUT_MS);
		try {
			const available = new DeferredPromise<ResolvedChatSessionsExtensionPoint | undefined>();
			store.add(this._chatSessionsService.onDidChangeAvailability(() => {
				const contribution = find();
				if (contribution) {
					available.complete(contribution);
				}
			}));
			return await Promise.race([available.p, timer.then(() => undefined)]);
		} finally {
			timer.cancel();
			store.dispose();
		}
	}
}

/**
 * The agent host session type a new-session link targets: an agent of the
 * linked remote agent host, or of the local agent host when the link names
 * none. The linked agent is required when present; otherwise Copilot is
 * preferred over other agents of the same host.
 */
export function findSessionTypeForLink(contributions: readonly ResolvedChatSessionsExtensionPoint[], link: Pick<IAgentHostNewSessionLink, 'connectionAuthority' | 'agent'>): ResolvedChatSessionsExtensionPoint | undefined {
	const candidates = contributions.filter(contribution => {
		const provider = contribution.agentHostProviderId;
		if (!provider || (link.agent && provider !== link.agent)) {
			return false;
		}
		return link.connectionAuthority
			? parseRemoteAgentHostSessionTypeAuthority(contribution.type, provider) === link.connectionAuthority
			: contribution.type.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX);
	});
	return candidates.find(contribution => isCopilotAgentHostProvider(contribution.agentHostProviderId)) ?? candidates[0];
}
