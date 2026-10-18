/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { chatUriFormatOf } from '../common/agentHostChatMinting.js';
import type { IAgentChatContext, IAgentChatOwnerRef, IAgentChatSessionSettings } from '../common/agent.js';
import type { ISessionStateSnapshot } from '../common/agentHostSessionStateStore.js';
import { ChatOriginKind } from '../common/state/protocol/state.js';
import { AH_META_WORKSPACELESS_DB_KEY, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, parseSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';
import { COPILOT_CUSTOMIZATION_DIRECTORY_KEY } from './agentHostSessionStateMirror.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';

function toKey(resource: URI | ProtocolURI): ProtocolURI {
	return typeof resource === 'string' ? resource : resource.toString();
}

function toUri(resource: URI | ProtocolURI): URI {
	return typeof resource === 'string' ? URI.parse(resource) : resource;
}

/** The session-wide settings of the session's central state, `undefined` while that is not loaded. */
function createAgentChatSessionSettings(snapshot: ISessionStateSnapshot | undefined): IAgentChatSessionSettings | undefined {
	if (!snapshot) {
		return undefined;
	}
	const defaultEntry = [...snapshot.chats.values()].find(entry => entry.isDefault);
	const defaultDirectories = defaultEntry?.launchWorkingDirectories?.map(entry => URI.parse(entry));
	const customizationDirectory = snapshot.values.get(COPILOT_CUSTOMIZATION_DIRECTORY_KEY);
	const projectUri = snapshot.values.get('copilot.project.uri');
	const projectName = snapshot.values.get('copilot.project.displayName');
	// The session's customizations follow its default chat's own folders, also
	// after a chat-only move (`copilot.sharedCustomizationDirectories` is kept
	// only for older builds).
	return {
		customizationDirectory: defaultDirectories?.[0] ?? (customizationDirectory ? URI.parse(customizationDirectory) : undefined),
		additionalCustomizationDirectories: defaultDirectories?.slice(1) ?? [],
		project: projectUri && projectName !== undefined ? { uri: URI.parse(projectUri), displayName: projectName } : undefined,
		workspaceless: snapshot.values.get(AH_META_WORKSPACELESS_DB_KEY) === 'true',
		defaultChatWorkingDirectory: defaultDirectories?.[0] ?? (defaultEntry?.workingDirectories?.[0] !== undefined ? URI.parse(defaultEntry.workingDirectories[0]) : undefined),
		additionalWorktrees: parseSessionAdditionalWorktrees(snapshot.values.get(ADDITIONAL_WORKTREES_METADATA_KEY)),
	};
}

/**
 * A live reference to the session that owns `chat`, read from the chat
 * registry at every {@link IAgentChatOwnerRef.get}. Before the chat is
 * registered (a provider creating it) it answers `session`, the session the
 * operation was issued for; after the chat leaves the registry it answers the
 * last owner it saw, so teardown keeps addressing that session.
 */
export function createChatOwnerRef(stateManager: AgentHostStateManager, chat: URI | ProtocolURI, session: URI | ProtocolURI): IAgentChatOwnerRef {
	const chatKey = toKey(chat);
	let last = toKey(session);
	let lastUri = toUri(session);
	const getOwner = () => {
		const owner = stateManager.getChatOwner(chatKey);
		if (owner !== undefined && owner !== last) {
			last = owner;
			lastUri = URI.parse(owner);
		}
		return lastUri;
	};
	return {
		get: getOwner,
		getSubagentChatUriFormat: () => chatUriFormatOf(stateManager.getDefaultChat(getOwner().toString())),
		onDidChange: Event.any(
			Event.map(Event.filter(stateManager.onDidChangeChatOwner, change => change.chat === chatKey), change => ({ previous: URI.parse(change.previous), current: URI.parse(change.current) })),
			// A chat that leaves the registry and registers again under another session changed owner too.
			Event.map(Event.filter(stateManager.onDidRegisterChat, registration => registration.chat === chatKey && registration.session !== last), registration => ({ previous: lastUri, current: URI.parse(registration.session) })),
		),
	};
}

/**
 * Builds the host-owned {@link IAgentChatContext} for an addressed chat
 * operation — the single place Agent Host derives the transient context handed
 * to a provider, so every boundary (create, materialize, send, truncate,
 * dispose, release, model/agent change, history read) carries the same facts:
 *
 * - `resource` — provider-owned persistence scope for the exact chat, its
 *   recorded `storageResource`;
 * - `owner` — the session that owns the chat, read at each use;
 * - `origin` — how the chat came into existence, read from its `ChatSummary`.
 *   Absent only in the narrow restore window before a chat is registered,
 *   where the restoring caller supplies the origin itself;
 * - `customizations` — the owning session's effective host customizations.
 * - `credentials` — the exact chat's sponsor or its unavailable source.
 *
 * Accepts either resource form so callers already holding protocol URI strings
 * (the action pipeline) need not round-trip through {@link URI}.
 */
export function createAgentChatContext(stateManager: AgentHostStateManager, authenticationService: IAgentHostAuthenticationService, session: URI | ProtocolURI, chat: URI | ProtocolURI, storageResource: ProtocolURI, sessionState: ISessionStateSnapshot | undefined): IAgentChatContext {
	const sessionKey = toKey(session);
	const chatKey = toKey(chat);
	// A registered chat is addressed under the session that owns it now and with its recorded storage; a chat
	// being created is not registered yet.
	const registeredOwner = stateManager.getChatOwner(chatKey);
	if (registeredOwner !== undefined && registeredOwner !== sessionKey) {
		throw new Error(`Chat ${chatKey} is owned by ${registeredOwner}, not ${sessionKey}`);
	}
	const recordedStorage = stateManager.getChatStorageResource(chatKey);
	if (recordedStorage !== undefined && recordedStorage !== storageResource) {
		throw new Error(`Chat ${chatKey} stores in ${recordedStorage}, not ${storageResource}`);
	}
	const principal = authenticationService.getSessionCredentialPrincipal(sessionKey);
	if (principal) {
		authenticationService.restoreSessionCredentialPrincipal(sessionKey, principal, chatKey);
	}
	const credentials = authenticationService.getSessionCredentialSource(chatKey);
	const origin = stateManager.getChatOrigin(chatKey);
	const customizations = stateManager.getSessionState(sessionKey)?.customizations;
	const sessionUri = toUri(session);
	const sessionSettings = createAgentChatSessionSettings(sessionState);
	const launch = sessionState?.chats.get(chatKey)?.launchWorkingDirectories;
	const isToolChat = typeof origin === 'object' && origin !== null && !Array.isArray(origin) && origin.kind === ChatOriginKind.Tool;
	return {
		resource: storageResource === sessionKey ? sessionUri : storageResource === chatKey ? toUri(chat) : URI.parse(storageResource),
		owner: createChatOwnerRef(stateManager, chat, session),
		sessionSettings,
		launchWorkingDirectories: isToolChat || sessionSettings?.workspaceless || !launch?.length ? undefined : launch.map(entry => URI.parse(entry)),
		...(origin ? { origin } : {}),
		...(customizations ? { customizations } : {}),
		...(credentials ? { credentials } : {}),
	};
}

/**
 * The exact chats an active client's contribution fans out to, owned by Agent
 * Host — or `undefined` when the host holds no state for the session.
 *
 * An empty/absent catalog is not the same as "only the default chat": a
 * session whose state hasn't been published yet has no authoritative
 * membership, so callers must skip provider fan-out rather than fabricate a
 * default-chat URI. Returned lists are always complete and non-empty.
 */
export function getSessionChatsForFanOut(stateManager: AgentHostStateManager, session: URI | ProtocolURI): URI[] | undefined {
	const sessionKey = toKey(session);
	const state = stateManager.getSessionState(sessionKey);
	if (!state) {
		return undefined;
	}
	const defaultChat = state.defaultChat ?? stateManager.getDefaultChat(sessionKey);
	const seen = new Set<string>();
	const chats: URI[] = [];
	for (const summary of state.chats) {
		if (!seen.has(summary.resource)) {
			seen.add(summary.resource);
			chats.push(URI.parse(summary.resource));
		}
	}
	if (defaultChat !== undefined && !seen.has(defaultChat)) {
		chats.unshift(URI.parse(defaultChat));
	}
	return chats;
}
