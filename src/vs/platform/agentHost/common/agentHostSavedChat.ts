/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { AgentProvider } from './agent.js';
import type { ChatOrigin, Message, Turn } from './state/protocol/channels-chat/state.js';

/** Saved workspace intent, including checkouts whose lifetime belongs to the source session. */
export type AgentHostSavedChatWorkspace =
	| { readonly kind: 'none' }
	| { readonly kind: 'folder'; readonly workingDirectories: readonly URI[] }
	| {
		readonly kind: 'managed';
		readonly workingDirectories: readonly URI[];
		readonly suggestedDirectories: readonly URI[];
		readonly managedDirectories: readonly URI[];
	};

/** A saved exact chat, read without restoring an executable provider session. */
export interface IAgentHostSavedChat {
	readonly session: URI;
	readonly chat: URI;
	readonly provider: AgentProvider;
	/** Opaque saved ownership identity, echoed when completing a continuation. */
	readonly identity: string;
	readonly origin?: ChatOrigin;
	readonly availability:
	| { readonly kind: 'available' }
	| { readonly kind: 'archived' }
	| { readonly kind: 'continued'; readonly destination: URI };
	readonly title: string;
	readonly turns: readonly Turn[];
	readonly draft?: Message;
	readonly workspace: AgentHostSavedChatWorkspace;
}

export interface IAgentHostSavedChatContinuation {
	readonly session: URI;
	readonly chat: URI;
	readonly identity: string;
	readonly destination: URI;
}

export interface IAgentHostSavedChatContinuationResult {
	/** Effective archive state of the selected chat, including its owning session. */
	readonly archived: boolean;
}

/** URI strings on the VS Code extension protocol, with protocol-native turns and draft. */
export interface IAgentHostSavedChatDto extends Omit<IAgentHostSavedChat, 'session' | 'chat' | 'workspace' | 'availability'> {
	readonly session: string;
	readonly chat: string;
	readonly availability:
	| { readonly kind: 'available' }
	| { readonly kind: 'archived' }
	| { readonly kind: 'continued'; readonly destination: string };
	readonly workspace:
	| { readonly kind: 'none' }
	| { readonly kind: 'folder'; readonly workingDirectories: readonly string[] }
	| {
		readonly kind: 'managed';
		readonly workingDirectories: readonly string[];
		readonly suggestedDirectories: readonly string[];
		readonly managedDirectories: readonly string[];
	};
}

export function savedChatToDto(chat: IAgentHostSavedChat): IAgentHostSavedChatDto {
	return {
		...chat,
		session: chat.session.toString(),
		chat: chat.chat.toString(),
		availability: chat.availability.kind === 'continued' ? { kind: 'continued', destination: chat.availability.destination.toString() } : chat.availability,
		workspace: chat.workspace.kind === 'none' ? chat.workspace : chat.workspace.kind === 'folder' ? {
			kind: 'folder',
			workingDirectories: chat.workspace.workingDirectories.map(directory => directory.toString()),
		} : {
			kind: 'managed',
			workingDirectories: chat.workspace.workingDirectories.map(directory => directory.toString()),
			suggestedDirectories: chat.workspace.suggestedDirectories.map(directory => directory.toString()),
			managedDirectories: chat.workspace.managedDirectories.map(directory => directory.toString()),
		},
	};
}

export function reviveSavedChat(chat: IAgentHostSavedChatDto): IAgentHostSavedChat {
	return {
		...chat,
		session: URI.parse(chat.session, true),
		chat: URI.parse(chat.chat, true),
		availability: chat.availability?.kind === 'continued' ? { kind: 'continued', destination: URI.parse(chat.availability.destination, true) } : chat.availability,
		workspace: chat.workspace.kind === 'none' ? chat.workspace : chat.workspace.kind === 'folder' ? {
			kind: 'folder',
			workingDirectories: chat.workspace.workingDirectories.map(directory => URI.parse(directory, true)),
		} : {
			kind: 'managed',
			workingDirectories: chat.workspace.workingDirectories.map(directory => URI.parse(directory, true)),
			suggestedDirectories: chat.workspace.suggestedDirectories.map(directory => URI.parse(directory, true)),
			managedDirectories: chat.workspace.managedDirectories.map(directory => URI.parse(directory, true)),
		},
	};
}
