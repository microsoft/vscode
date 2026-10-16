/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostService, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { getSessionChatResource, StateComponents, type ChatState, type SessionConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { readChatSandboxState, readSessionSandboxState, type ISessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { getChatConfigChain, getChatConfigWriteTarget, getEffectiveChatConfig, mergeChatConfigChain, splitChatConfigPatch } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from '../../../common/agentHostConfigPolicy.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { getLocalAgentHostSessionProvider, resolveAgentHostChatSession, toAgentHostBackendSessionUri } from './agentHostSessionUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/**
 * Services needed to apply a session-config change to an agent-host-backed chat
 * session from the editor window.
 */
export interface IApplyAgentHostSessionConfigServices {
	readonly agentHostService: IAgentHostService;
	readonly connectionsService: IAgentHostConnectionsService;
	readonly provisionalService: IAgentHostUntitledProvisionalSessionService;
	readonly workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver;
	readonly workspaceContextService: IWorkspaceContextService;
	readonly configurationService: IConfigurationService;
}

/**
 * The backend chat `sessionResource` names, from its session's chat catalog: the
 * session's default chat, or the peer chat its fragment names.
 */
export function getAgentHostBackendChat(sessionResource: URI, state: SessionState): string | undefined {
	return sessionResource.fragment ? getSessionChatResource(state, sessionResource.fragment, state.defaultChat) : state.defaultChat;
}

/**
 * The backend chats whose own config values apply to `backendChat`: the chat
 * and, for a subagent, the chats that spawned it, as recorded in its session's
 * chat catalog.
 */
export function getAgentHostChatConfigChain(state: SessionState, backendChat: string | undefined): readonly string[] {
	return backendChat !== undefined ? getChatConfigChain(state.chats, backendChat) : [];
}

/**
 * A chat's effective config: its session's, with the own values of the chat
 * and, for a subagent, of the chats that spawned it applied for the properties
 * the session's schema lets a chat set. `readChat` supplies each chat's state.
 */
export function getAgentHostChatConfig(state: SessionState, backendChat: string | undefined, readChat: (chat: string) => ChatState | Error | undefined): SessionConfigState | undefined {
	return state.config && getEffectiveChatConfig(state.config, mergeChatConfigChain(getAgentHostChatConfigChain(state, backendChat).map(chat => {
		const chatState = readChat(chat);
		return chatState && !(chatState instanceof Error) ? chatState.config : undefined;
	})));
}

/**
 * The sandbox state the host applied for a chat (a subagent runs in the
 * runtime of the chat that spawned it), or for its session when it reports
 * none for the chat.
 */
export function readAgentHostChatSandboxState(state: SessionState, backendChat: string | undefined): ISessionSandboxState | undefined {
	return getAgentHostChatConfigChain(state, backendChat).map(chat => readChatSandboxState(state, chat)).find(chatState => chatState !== undefined) ?? readSessionSandboxState(state);
}

/**
 * Sends a config change for a chat: the properties the session's schema lets a
 * chat set go to the chat (for a subagent, to its nearest spawning chat that is
 * not one, as the host does), everything else to its session, in that order.
 *
 * A patch with both kinds becomes two actions, which the host applies or
 * rejects independently; each is reconciled on its own echo. That is safe
 * because the two halves are different properties with no write-time
 * dependency between them (validation of either reads only the effective
 * values already applied), and pickers send one property at a time.
 */
export function dispatchAgentHostConfigChange(connection: Pick<IAgentConnection, 'dispatch'>, backendSession: URI, backendChat: string | undefined, state: SessionState | undefined, partial: Record<string, unknown>): void {
	const target = backendChat !== undefined ? getChatConfigWriteTarget(state?.chats, backendChat) : undefined;
	const { chat, session } = target !== undefined ? splitChatConfigPatch(state?.config?.schema, partial) : { chat: {}, session: partial };
	if (target !== undefined && Object.keys(chat).length > 0) {
		connection.dispatch(target, { type: ActionType.ChatConfigChanged, config: chat });
	}
	if (Object.keys(session).length > 0) {
		connection.dispatch(backendSession.toString(), { type: ActionType.SessionConfigChanged, config: session });
	}
}

/** The effective config of the chat `sessionResource` names. */
export function getAgentHostSessionConfig(
	sessionResource: URI,
	provisionalService: IAgentHostUntitledProvisionalSessionService,
	connectionsService: IAgentHostConnectionsService,
): ResolveSessionConfigResult | undefined {
	const resolution = resolveAgentHostChatSession(sessionResource, provisionalService.get(sessionResource), connectionsService);
	const snapshot = resolution?.connection.getSubscriptionUnmanaged(StateComponents.Session, resolution.backendSession)?.value;
	if (!snapshot || snapshot instanceof Error) {
		return provisionalService.getResolvedConfig(sessionResource);
	}
	const chat = getAgentHostBackendChat(sessionResource, snapshot);
	return getAgentHostChatConfig(snapshot, chat, chat => resolution.connection.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(chat))?.value) ?? provisionalService.getResolvedConfig(sessionResource);
}

/**
 * Applies a partial session-config change (e.g. `autoApprove` and/or `mode`) to
 * the agent-host session backing `sessionResource` in the editor window. This is
 * the editor-window analogue of the Agents-window provider `setSessionConfigValue`
 * path — it routes untitled sessions through the provisional service, and existing
 * sessions through `chat/configChanged` for the properties the chat may set for
 * itself and `session/configChanged` for the rest, matching how the agent-host
 * chat-input pickers apply changes.
 *
 * An elevated `autoApprove` value is clamped back to `default` when enterprise
 * policy disables global auto-approval, mirroring the pickers.
 *
 * @returns `true` when `sessionResource` is agent-host-backed and the change was
 * dispatched, `false` otherwise (so callers can fall back).
 */
export async function applyAgentHostSessionConfigChange(
	sessionResource: URI,
	config: Readonly<Record<string, string>>,
	services: IApplyAgentHostSessionConfigServices,
): Promise<boolean> {
	const provider = getLocalAgentHostSessionProvider(sessionResource);
	if (!provider) {
		return false;
	}

	const { agentHostService, connectionsService, provisionalService, workingDirectoryResolver, workspaceContextService, configurationService } = services;
	const backendSession = toAgentHostBackendSessionUri(sessionResource, connectionsService);
	const subscribed = backendSession ? agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value : undefined;
	const state = subscribed && !(subscribed instanceof Error) ? subscribed : undefined;
	const backendChat = state && getAgentHostBackendChat(sessionResource, state);
	const currentConfig = (state && getAgentHostChatConfig(state, backendChat, chat => agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(chat))?.value)) ?? provisionalService.getResolvedConfig(sessionResource);
	const policyRestricted = isAutoApprovePolicyRestricted(configurationService, currentConfig?.schema);
	const partial = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, normalizeSessionConfigValue(key, value, policyRestricted)]));

	const workingDirectory = workingDirectoryResolver.resolve(sessionResource)
		?? workspaceContextService.getWorkspace().folders[0]?.uri;

	if (isUntitledChatSession(sessionResource)) {
		await provisionalService.applyConfigChange(sessionResource, provider, workingDirectory, partial);
		return true;
	}

	if (!backendSession) {
		return false;
	}
	dispatchAgentHostConfigChange(agentHostService, backendSession, backendChat, state, partial);
	const nextConfig = { ...(state ? currentConfig?.values : undefined), ...partial };
	void provisionalService.refreshResolvedConfig(sessionResource, provider, workingDirectory, nextConfig);
	return true;
}
