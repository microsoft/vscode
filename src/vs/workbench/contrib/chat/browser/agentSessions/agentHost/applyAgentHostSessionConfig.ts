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
import { getSessionChatResource, StateComponents, type ChatConfigState, type ChatState, type RootState, type SessionConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { readChatSandboxState, readSessionSandboxState, type ISessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { getChatConfigChain, getChatConfigWriteTarget, getEffectiveChatConfig, isChatConfigProperty, mergeChatConfigChain, splitChatConfigPatch } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ChatProvidersConfigKey } from '../../../../../../platform/agentHost/common/agentHostChatProviders.js';
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
 * The backend chats whose config applies to `backendChat`: the chat and, for a
 * subagent (which has no config of its own), the chats that spawned it, as
 * recorded in its session's chat catalog.
 */
export function getAgentHostChatConfigChain(state: SessionState, backendChat: string | undefined): readonly string[] {
	return backendChat !== undefined ? getChatConfigChain(state.chats, backendChat) : [];
}

/**
 * The agent provider backing `backendChat` when it differs from its session's
 * (a chat on its session's agent reads `undefined`).
 */
export function getAgentHostChatOwnAgent(state: SessionState, backendChat: string | undefined): string | undefined {
	const provider = backendChat !== undefined ? state.chats?.find(chat => chat.resource.toString() === backendChat)?.provider : undefined;
	return provider !== undefined && provider !== state.provider ? provider : undefined;
}

/**
 * Whether the host publishes each chat's complete config values: only while its
 * chats may use their own agents (root `multipleChatProviders.enabled`). Older
 * hosts, and hosts with the setting off, publish the values a chat set itself, as
 * an overlay on its session's. The host must also declare the key in its root
 * schema: an older host keeps the value this client mirrors to it without
 * supporting the feature.
 */
export function hostPublishesCompleteChatConfig(rootState: RootState | Error | undefined): boolean {
	const config = !!rootState && !(rootState instanceof Error) ? rootState.config : undefined;
	return !!config?.schema.properties[ChatProvidersConfigKey.Enabled] && config.values[ChatProvidersConfigKey.Enabled] === true;
}

/**
 * A chat's effective config (see {@link getEffectiveChatConfig}), read as its
 * host publishes it: complete values, or an overlay on its session's (see
 * {@link hostPublishesCompleteChatConfig}).
 */
export function getAgentHostEffectiveChatConfig(session: SessionConfigState, chat: ChatConfigState | undefined, completeValues: boolean): SessionConfigState {
	return getEffectiveChatConfig(session, chat, completeValues);
}

/**
 * A chat's effective config (see {@link getAgentHostEffectiveChatConfig}), from
 * the config of the chat or, for a subagent, of the chat that spawned it.
 * `readChat` supplies each chat's state.
 *
 * A chat whose agent differs from its session's has its own schema in its
 * state and never uses the session's config: until its state is known it has
 * none.
 */
export function getAgentHostChatConfig(state: SessionState, backendChat: string | undefined, readChat: (chat: string) => ChatState | Error | undefined, completeValues: boolean): SessionConfigState | undefined {
	const chat = mergeChatConfigChain(getAgentHostChatConfigChain(state, backendChat).map(member => {
		const chatState = readChat(member);
		return chatState && !(chatState instanceof Error) ? chatState.config : undefined;
	}));
	if (getAgentHostChatOwnAgent(state, backendChat) !== undefined && !chat?.schema) {
		return undefined;
	}
	return state.config && getAgentHostEffectiveChatConfig(state.config, chat, completeValues);
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
 * Whether the host behind `rootState` applies a session config write to its session's default chat, replacing the
 * value the default chat set itself: only while its chats may use their own agents. Otherwise, as on older hosts, the
 * default chat's own value overrides the session's, so a client writes the default chat itself.
 */
export function hostAppliesSessionConfigToDefaultChat(rootState: RootState | Error | undefined): boolean {
	return hostPublishesCompleteChatConfig(rootState);
}

/**
 * Sends a config change for a chat: the properties the session's schema lets a
 * chat set go to the chat (for a subagent, to its nearest spawning chat that is
 * not one, as the host does), everything else to its session, in that order.
 * The session's config is its default chat's: on a host that applies session
 * writes to its default chat (see {@link hostAppliesSessionConfigToDefaultChat}),
 * a property the session may set too is written to the session for that chat;
 * an older host gets it on the default chat, as before.
 *
 * A patch with both kinds becomes two actions, which the host applies or
 * rejects independently; each is reconciled on its own echo. That is safe
 * because the two halves are different properties with no write-time
 * dependency between them (validation of either reads only the effective
 * values already applied), and pickers send one property at a time.
 */
export function dispatchAgentHostConfigChange(connection: Pick<IAgentConnection, 'dispatch' | 'rootState'>, backendSession: URI, backendChat: string | undefined, state: SessionState | undefined, partial: Record<string, unknown>, chatConfig?: SessionConfigState): void {
	const target = backendChat !== undefined ? getChatConfigWriteTarget(state?.chats, backendChat) : undefined;
	if (state && getAgentHostChatOwnAgent(state, backendChat) !== undefined) {
		// A chat on another agent than its session's sets only its agent's chat-settable properties; nothing reaches the session.
		const own = Object.fromEntries(Object.entries(partial).filter(([key]) => isChatConfigProperty(chatConfig?.schema, key)));
		if (target !== undefined && Object.keys(own).length > 0) {
			connection.dispatch(target, { type: ActionType.ChatConfigChanged, config: own });
		}
		return;
	}
	const { chat, session } = target !== undefined ? splitChatConfigPatch(state?.config?.schema, partial) : { chat: {}, session: partial };
	if (target !== undefined && target === state?.defaultChat && hostAppliesSessionConfigToDefaultChat(connection.rootState.value)) {
		// What the session may set too goes to the session, which the host applies to its default chat.
		for (const key of Object.keys(chat)) {
			if (state.config?.schema.properties[key]?.sessionMutable) {
				session[key] = chat[key];
				delete chat[key];
			}
		}
	}
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
	const config = getAgentHostChatConfig(snapshot, chat, chat => resolution.connection.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(chat))?.value, hostPublishesCompleteChatConfig(resolution.connection.rootState?.value));
	// Never the session's (or its provisional) config for a chat on another agent.
	return getAgentHostChatOwnAgent(snapshot, chat) !== undefined ? config : config ?? provisionalService.getResolvedConfig(sessionResource);
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
	const chatOnOwnAgent = !!state && getAgentHostChatOwnAgent(state, backendChat) !== undefined;
	const chatConfig = state && getAgentHostChatConfig(state, backendChat, chat => agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(chat))?.value, hostPublishesCompleteChatConfig(agentHostService.rootState?.value));
	const currentConfig = chatOnOwnAgent ? chatConfig : chatConfig ?? provisionalService.getResolvedConfig(sessionResource);
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
	dispatchAgentHostConfigChange(agentHostService, backendSession, backendChat, state, partial, currentConfig);
	const nextConfig = { ...(state ? currentConfig?.values : undefined), ...partial };
	void provisionalService.refreshResolvedConfig(sessionResource, provider, workingDirectory, nextConfig);
	return true;
}
