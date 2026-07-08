/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isAhpChatChannel, isDefaultChatUri, parseChatUri, type ToolDefinition, type URI } from '../../common/state/sessionState.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

/** Name of the agent-facing session-rename server tool. */
export const RENAME_SESSION_TOOL_NAME = 'rename_session';

/**
 * Outcome of a {@link IRenameSessionHandler} call: `'renamed'` (the session
 * title was updated, `title` carries the cleaned value), `'skippedUserNamed'`
 * (the user has already named the session, so the request was ignored), or
 * `'invalid'` (the requested title was empty or could not be cleaned).
 */
export interface IRenameSessionToolResult {
	readonly status: 'renamed' | 'skippedUserNamed' | 'invalid';
	readonly title?: string;
}

/**
 * Applies an agent-requested session rename. Wired at host construction to the
 * title controller so the tool stays free of state-manager and persistence
 * concerns.
 */
export type IRenameSessionHandler = (sessionUri: URI, rawTitle: string) => IRenameSessionToolResult;

const renameSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		title: {
			type: 'string',
			description: 'Short, human-friendly session name in sentence case (1-4 words, e.g. "Adding JWT auth"). Never use kebab-case, snake_case, or raw git branch names.',
			maxLength: 40,
		},
	},
	required: ['title'],
};

/**
 * Protocol {@link ToolDefinition}s for the rename-session server tool, advertised
 * on {@link SessionState.serverTools} so clients know the tool is owned and
 * executed by the agent host. The description is model-facing (not localized).
 */
export const renameSessionServerToolDefinitions: ToolDefinition[] = [
	{
		name: RENAME_SESSION_TOOL_NAME,
		title: 'Rename Session',
		description: 'Rename the current session so it is easy to find later. Use a short, human-friendly session name in sentence case (1-4 words, e.g. "Adding JWT auth"). Never use kebab-case, snake_case, or raw git branch names.',
		inputSchema: renameSessionInputSchema,
		annotations: { readOnlyHint: false },
	},
];

interface IRenameSessionArgs {
	readonly title?: unknown;
}

function readTitleArg(rawArgs: unknown): string | undefined {
	const args = (rawArgs ?? {}) as IRenameSessionArgs;
	return typeof args.title === 'string' ? args.title : undefined;
}

/**
 * Display strings for the rename-session tool. Uses the requested title for the
 * past-tense message when available. Localized (shown to the user in the UI).
 */
export function getRenameSessionToolDisplay(toolName: string, args: unknown, _result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	if (toolName !== RENAME_SESSION_TOOL_NAME) {
		return undefined;
	}
	const title = readTitleArg(args);
	return {
		displayName: localize('toolName.renameSession', "Rename Session"),
		invocationMessage: localize('toolInvoke.renameSession', "Renaming session"),
		pastTenseMessage: title
			? localize('toolComplete.renameSessionTo', "Renamed session to \"{0}\"", title)
			: localize('toolComplete.renameSession', "Renamed session"),
	};
}

/**
 * Creates the rename-session server-tool group, bound to {@link handler} at host
 * construction (see `node/agentService.ts`). The tool renames the **session**
 * only: a peer (non-default) chat URI is rejected; a default-chat URI is
 * normalized to its owning session. All state and persistence live behind the
 * handler.
 */
export function createRenameSessionServerToolGroup(handler: IRenameSessionHandler): IServerToolGroup {
	return {
		definitions: renameSessionServerToolDefinitions,
		getDisplay(toolName, args, result): IServerToolDisplay | undefined {
			return getRenameSessionToolDisplay(toolName, args, result);
		},
		execute(_stateManager, chatUri, _toolName, rawArgs): string {
			if (isAhpChatChannel(chatUri) && !isDefaultChatUri(chatUri)) {
				return 'Renaming additional chats is not supported; only the session can be renamed.';
			}
			const rawTitle = readTitleArg(rawArgs);
			if (rawTitle === undefined || rawTitle.length === 0) {
				throw new Error(`Invalid ${RENAME_SESSION_TOOL_NAME} input: title must be a non-empty string.`);
			}
			const sessionUri = parseChatUri(chatUri)?.session ?? chatUri;
			const outcome = handler(sessionUri, rawTitle);
			if (outcome.status === 'renamed') {
				return `Renamed session to "${outcome.title}".`;
			}
			if (outcome.status === 'skippedUserNamed') {
				return 'Skipped: the session was already renamed by the user.';
			}
			return 'Could not rename the session: the provided title was empty after normalization.';
		},
	};
}
