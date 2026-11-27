/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from '../../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import type { IServerToolDisplay, IServerToolExecutionContext, IServerToolGroup } from './agentServerToolHost.js';

/** The folders of a chat that `isolate_session` can move into worktrees of their own. */
export interface IIsolatableFolders {
	/** Local Git checkouts of the chat that are not in a worktree of the session yet. */
	readonly folders: readonly URI[];
	/** The chat's primary folder, when it is one of {@link folders}: moving it moves the chat to a new worktree. */
	readonly primary?: URI;
}

export interface ISessionIsolationToolAccessor {
	/** Stable provider support for moving a chat; exact-chat eligibility is checked when requesting isolation. */
	supportsChatIsolation(session: URI): boolean;
	/**
	 * Schedules moving the chat, with its primary folder `primary`, to a new worktree once `turnId` ends, and then
	 * `additionalFolders` (other folders of the chat) into worktrees of their own; the host then continues the task.
	 * Throws when the chat's primary folder is no longer `primary`, which the user confirmed.
	 */
	requestChatIsolation(chat: URI, turnId: string, primary: URI, additionalFolders: readonly URI[]): void;
	/** Whether the chats of `session` can isolate their additional folders: the session uses worktree isolation. */
	supportsFolderIsolation?(session: URI): boolean;
	/** Schedules moving additional folders of `chat` into worktrees of their own once `turnId` ends; the host then continues the task. */
	requestFolderIsolation?(session: URI, chat: URI, folders: readonly URI[], turnId: string): void;
	/** The folders of `chat` that it can move into worktrees now. */
	getIsolatableFolders(session: URI, chat: URI): Promise<IIsolatableFolders>;
}

export function createSessionIsolationToolGroup(accessor?: ISessionIsolationToolAccessor): IServerToolGroup {
	return {
		definitions: [{
			name: SessionServerToolName.IsolateSession,
			description: 'Move folders of the current chat into new Git worktrees of their own, so that its changes do not touch the user\'s checkouts. Pass only the folders you are about to change that the working directories list as shared Git checkouts, before any tool that creates, edits or deletes files or runs commands that change files there, or the chat\'s folder when the user asks to continue this task in a new worktree. Moving the chat\'s main folder moves the chat to a new worktree; its other folders stay unless you pass them too. Not needed for reading, or for folders that are already in a worktree or not in a Git repository. Only this chat changes: other chats and the original checkouts are left unchanged, and uncommitted edits are not copied except configured worktree include-files. Folders in the same checkout share one worktree. Follow the tool confirmation flow; if the user skips it, nothing moves and you continue where you are. Make this the final tool call and end the turn after it succeeds; the host then moves the folders and continues the task automatically, telling you the new paths. Do not poll or repeat the request.',
			inputSchema: {
				type: 'object',
				properties: {
					folders: {
						type: 'array',
						items: { type: 'string' },
						minItems: 1,
						description: 'Absolute paths of this chat\'s folders to move into worktrees of their own: only the shared Git checkouts you are about to change, as listed in the working directories.',
					},
				},
				required: ['folders'],
			},
			topLevelChatOnly: true,
			deferLoading: true,
		}],
		isEnabled: () => true,
		isEnabledForSession: (_tool, session) => accessor?.supportsChatIsolation(URI.parse(session)) === true
			|| accessor?.supportsFolderIsolation?.(URI.parse(session)) === true,
		canRequireConfirmation: () => true,
		getDisplay: (_tool, args) => isolateDisplay(readFoldersArgument(args)),
		execute: (_stateManager, context, _tool, args) => isolate(accessor, context, args),
	};
}

async function isolate(accessor: ISessionIsolationToolAccessor | undefined, context: IServerToolExecutionContext, args: unknown): Promise<string> {
	if (!accessor || !context.turnId) {
		throw new Error(localize('isolateSession.activeTurnRequired', "Moving folders to worktrees with this tool requires an active turn."));
	}
	const session = URI.parse(context.sessionUri);
	const chat = URI.parse(context.chatUri);
	const requested = readFoldersArgument(args);
	const isolatable = await accessor.getIsolatableFolders(session, chat);
	// Each requested folder as the chat lists it, so that a path differing only in case where the file system ignores it is that folder
	const folders = requested?.map(path => isolatable.folders.find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, URI.file(path))));
	// A folder named twice, also by paths that differ only in case where the file system ignores it, is a malformed call
	if (!folders?.length || folders.some(folder => folder === undefined) || new Set(folders).size !== folders.length) {
		const invalid = requested?.filter((_path, index) => folders?.[index] === undefined) ?? [];
		throw new Error([
			`${SessionServerToolName.IsolateSession} takes 'folders': the absolute paths, each once, of folders of this chat that are local Git checkouts not in a worktree yet, and no other arguments.`,
			...(invalid.length ? [`Not a folder you can pass: ${invalid.map(path => JSON.stringify(path)).join(', ')}.`] : []),
			isolatable.folders.length
				? `Folders you can pass: ${isolatable.folders.map(folder => JSON.stringify(folder.fsPath)).join(', ')}.`
				: 'This chat has no folder to move into a worktree.',
		].join(' '));
	}
	const resolved = folders as URI[];
	const primary = isolatable.primary;
	if (primary && resolved.includes(primary)) {
		const others = resolved.filter(folder => folder !== primary);
		accessor.requestChatIsolation(chat, context.turnId, primary, others);
		return others.length
			? `Moving this chat to a new worktree of ${JSON.stringify(primary.fsPath)}, and ${others.map(folder => JSON.stringify(folder.fsPath)).join(', ')} into worktrees of their own, is scheduled. End this turn now without calling more tools or replying. The host will move only this chat and those folders, update the session workspace, and continue the original task automatically, telling you each new path. Other chats remain unchanged.`
			: 'Moving this chat to a new worktree is scheduled. End this turn now without calling more tools or replying. The host will move only this chat to a new worktree, update the session workspace, and continue the original task automatically. Other chats remain unchanged.';
	}
	if (!accessor.requestFolderIsolation) {
		throw new Error('This chat\'s folders cannot be moved into worktrees.');
	}
	accessor.requestFolderIsolation(session, chat, resolved, context.turnId);
	return `Moving ${resolved.map(folder => JSON.stringify(folder.fsPath)).join(', ')} into worktrees of their own is scheduled. End this turn now without calling more tools or replying. The host will move the folders, update the session workspace, and continue the original task automatically, telling you each folder's new path; from then on, make every change to those folders there only.`;
}

/** The absolute paths of a well-formed `folders` argument with no other property, or `undefined`. */
function readFoldersArgument(args: unknown): readonly string[] | undefined {
	if (!args || typeof args !== 'object' || Array.isArray(args)) {
		return undefined;
	}
	const { folders, ...rest } = args as { folders?: unknown };
	if (Object.keys(rest).length > 0 || !Array.isArray(folders) || folders.length === 0
		|| !folders.every(folder => typeof folder === 'string' && isAbsolute(folder))) {
		return undefined;
	}
	return folders as string[];
}

function isolateDisplay(folders: readonly string[] | undefined): IServerToolDisplay {
	const names = folders?.map(folder => basename(URI.file(folder)));
	return {
		displayName: localize('isolateSession.name', "Move to a New Worktree"),
		invocationMessage: names?.length === 1
			? localize('isolateSession.invocationOne', "Requesting a worktree for {0}", names[0])
			: names
				? localize('isolateSession.invocationMany', "Requesting worktrees for {0} folders", names.length)
				: localize('isolateSession.invocation', "Requesting a new worktree"),
		pastTenseMessage: names?.length === 1
			? localize('isolateSession.completeOne', "Requested a worktree for {0}", names[0])
			: names
				? localize('isolateSession.completeMany', "Requested worktrees for {0} folders", names.length)
				: localize('isolateSession.complete', "Requested a new worktree"),
		confirmationTitle: folders && folders.length > 1
			? localize('isolateSession.confirmTitleMany', "Move Folders to New Worktrees?")
			: localize('isolateSession.confirmTitle', "Move to a New Worktree?"),
		// Full paths, as the raw input is not shown: folders of several repositories can share a name
		confirmationMessage: folders?.length === 1
			? localize('isolateSession.confirmOne', "Move {0} to a new worktree for this chat? Your checkout and other chats are left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working where you are.", folders[0])
			: folders
				? localize('isolateSession.confirmMany', "Move {0} folders to new worktrees for this chat: {1}? Your checkouts and other chats are left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working where you are.", folders.length, folders.join(', '))
				: localize('isolateSession.confirm', "Move this chat's folders to new worktrees? Your checkouts and other chats are left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working where you are."),
		hideConfirmationInput: true,
	};
}
