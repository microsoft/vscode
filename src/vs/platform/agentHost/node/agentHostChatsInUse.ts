/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatOriginKind, isSessionChatArchived, readSessionWorkspaceless, type ChatSummary, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { inheritedChatFolders } from './agentChatContext.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/** A chat of a session that is in use, with the folders it works in. */
export interface IChatInUse {
	/**
	 * The chat whose folders the chat works in: the chat itself, the chat that spawned it, or an
	 * ancestor of that chat. `undefined` when the spawning chat is unknown.
	 */
	readonly source: ChatSummary | undefined;
	/** The folders the chat works in, `undefined` when its spawning chat is unknown. */
	readonly workingDirectories: readonly string[] | undefined;
}

export interface IChatsInUseOptions {
	/** A chat, with the chats it spawned, that does not count. */
	readonly excludedChat?: string;
	/** The folders a chat without folders of its own works in (see {@link inheritedChatFolders}). */
	readonly inheritedFolders: readonly string[];
	/** Whether a workspace is being applied to the chat, which has not started and so holds no folders unless it has its own. */
	readonly isApplyingWorkspace?: (chat: string) => boolean;
}

/**
 * The session's chats that are in use, with the folders they work in. A subagent's own folders are never
 * considered: it works in the folders of the chat that spawned it. A side chat works in its own folders, or
 * else in those of its spawning chat. Both are in use only while their spawning chat is. An archived chat is
 * not in use. A chat without folders of its own works in `inheritedFolders`.
 */
export function getChatsInUse(chats: readonly ChatSummary[], options: IChatsInUseOptions): readonly IChatInUse[] {
	const byResource = new Map(chats.map(chat => [chat.resource, chat]));
	const ownWorkingDirectories = (chat: ChatSummary | undefined) => chat?.origin?.kind === ChatOriginKind.Tool ? undefined : chat?.workingDirectories;
	const inUse: IChatInUse[] = [];
	for (const chat of chats) {
		let workingDirectories = ownWorkingDirectories(chat);
		let source: ChatSummary | undefined = workingDirectories !== undefined ? chat : undefined;
		let owner: ChatSummary | undefined = chat;
		let ownerResource = chat.resource;
		const visited = new Set<string>();
		while (owner && (owner.origin?.kind === ChatOriginKind.Tool || owner.origin?.kind === ChatOriginKind.SideChat) && !visited.has(owner.resource)) {
			visited.add(owner.resource);
			ownerResource = owner.origin.chat;
			owner = byResource.get(ownerResource);
			if (workingDirectories === undefined) {
				workingDirectories = ownWorkingDirectories(owner);
				if (workingDirectories !== undefined) {
					source = owner;
				}
			}
		}
		// A chat a workspace is applied to has not started: without folders of its own it holds none of the session's.
		if (ownerResource === options.excludedChat || (owner && isSessionChatArchived(owner)) || (workingDirectories === undefined && options.isApplyingWorkspace?.(ownerResource))) {
			continue;
		}
		inUse.push({
			source: source ?? owner,
			workingDirectories: workingDirectories ?? (owner ? options.inheritedFolders : undefined),
		});
	}
	return inUse;
}

/**
 * The chats whose folders the session's cumulative changes cover: the default chat, and the chat each other
 * chat in use works in the folders of ({@link getChatsInUse}). Archived chats and the pinned folders of subagents
 * are left out, so folders only they used (often deleted worktrees) are neither computed nor watched.
 */
export function getSessionSummarySources(stateManager: AgentHostStateManager, session: ProtocolURI, defaultChat: ProtocolURI | undefined): readonly ProtocolURI[] {
	const state = stateManager.getSessionState(session);
	if (!state) {
		return defaultChat !== undefined ? [defaultChat] : [];
	}
	const sources = new Set<ProtocolURI>(defaultChat !== undefined ? [defaultChat] : []);
	const inheritedFolders = inheritedChatFolders(stateManager, stateManager.getSessionSummary(session)?.workingDirectories ?? [], readSessionWorkspaceless(state._meta));
	for (const { source } of getChatsInUse(state.chats, { inheritedFolders })) {
		if (source) {
			sources.add(source.resource);
		}
	}
	return [...sources];
}
