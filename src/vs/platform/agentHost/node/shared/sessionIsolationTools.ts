/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from '../../../../base/common/path.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import type { IServerToolDisplay, IServerToolExecutionContext, IServerToolGroup } from './agentServerToolHost.js';

export interface ISessionIsolationToolAccessor {
	/** Stable provider support; exact-chat eligibility is checked when requesting isolation. */
	supportsChatIsolation(session: URI): boolean;
	requestChatIsolation(chat: URI, turnId: string): void;
	/** Whether the chats of `session` can isolate their additional folders: the session uses worktree isolation. Without it, `isolate_folder` is not offered. */
	supportsFolderIsolation?(session: URI): boolean;
	/** Schedules moving an additional folder of `chat` into a worktree of its own once `turnId` ends; the host then continues the task. */
	requestFolderIsolation?(session: URI, chat: URI, folder: URI, turnId: string): void;
}

export function createSessionIsolationToolGroup(accessor?: ISessionIsolationToolAccessor): IServerToolGroup {
	return {
		definitions: [{
			name: SessionServerToolName.IsolateSession,
			description: 'Move only the current chat to a new Git worktree when the user wants to continue this task without changing its current checkout. This preserves the chat and its history; it does not create a separate task or move other chats, even those sharing the same folder. The session workspace will include the new worktree. The original folder is unchanged, and uncommitted edits are not copied except configured worktree include-files. Requires a chat working in one local Git folder. Follow the tool confirmation flow. Make this the final tool call and end the turn after it succeeds; the host then moves this chat and continues its task automatically. Do not poll or repeat the request.',
			inputSchema: { type: 'object', properties: {} },
			topLevelChatOnly: true,
			deferLoading: true,
		}, {
			name: SessionServerToolName.IsolateFolder,
			description: 'Move one additional folder of the current chat into a Git worktree of its own, on a new branch created from the folder\'s current branch, when you are about to change files in a folder that the working directories list as a shared checkout, not isolated. Call it before any tool that creates, edits or deletes files or runs commands that change files there. Not needed for reading, for the primary folder, which is already isolated, or for folders that are not in a Git repository. Only the current chat\'s folder is replaced by the worktree; other chats and the original folder are left unchanged, and uncommitted edits are not copied except configured worktree include-files. Folders in the same checkout share one worktree. Follow the tool confirmation flow; if the user skips it, the folder is not moved and you continue in the shared folder. Make this the final tool call and end the turn after it succeeds, calling it first for each other shared checkout you will change; the host then moves the folders and continues its task automatically, telling you each folder\'s new path. Do not poll or repeat the request.',
			inputSchema: {
				type: 'object',
				properties: {
					folder: { type: 'string', description: 'The absolute path of the additional folder, as listed in the working directories.' },
				},
				required: ['folder'],
			},
			topLevelChatOnly: true,
			deferLoading: true,
		}],
		isEnabled: () => true,
		isEnabledForSession: (tool, session) => tool === SessionServerToolName.IsolateFolder
			? accessor?.supportsFolderIsolation?.(URI.parse(session)) === true
			: accessor?.supportsChatIsolation(URI.parse(session)) === true,
		canRequireConfirmation: () => true,
		getDisplay: (tool, args) => tool === SessionServerToolName.IsolateFolder ? isolateFolderDisplay(args) : {
			displayName: localize('isolateSession.name', "Change Workspace to a New Worktree"),
			invocationMessage: localize('isolateSession.invocation', "Requesting a workspace change to a new worktree"),
			pastTenseMessage: localize('isolateSession.complete', "Requested a workspace change to a new worktree"),
			confirmationTitle: localize('isolateSession.confirmTitle', "Change Workspace?"),
			confirmationMessage: localize('isolateSession.confirm', "Change only this chat's workspace to a new worktree? Other chats and the original folder are left unchanged. Uncommitted edits are not copied, except configured worktree include-files."),
			hideConfirmationInput: true,
		},
		execute: (_stateManager, context, tool, args) => {
			if (tool === SessionServerToolName.IsolateFolder) {
				return isolateFolder(accessor, context, args);
			}
			if (!accessor || !context.turnId) {
				throw new Error(localize('isolateSession.activeTurnRequired', "Changing a chat's workspace with this tool requires an active turn."));
			}
			if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0) {
				throw new Error('isolate_session takes no arguments.');
			}
			accessor.requestChatIsolation(URI.parse(context.chatUri), context.turnId);
			return 'Moving this chat to a new worktree is scheduled. End this turn now without calling more tools or replying. The host will move only this chat to a new worktree, update the session workspace, and continue the original task automatically. Other chats remain unchanged.';
		},
	};
}

function isolateFolder(accessor: ISessionIsolationToolAccessor | undefined, context: IServerToolExecutionContext, args: unknown): string {
	const folder = readFolderArgument(args);
	if (!accessor?.requestFolderIsolation || folder === undefined) {
		throw new Error(`${SessionServerToolName.IsolateFolder} takes the absolute path of one additional folder of this chat as 'folder'.`);
	}
	if (!context.turnId) {
		throw new Error(localize('isolateFolder.activeTurnRequired', "Isolating a folder with this tool requires an active turn."));
	}
	accessor.requestFolderIsolation(URI.parse(context.sessionUri), URI.parse(context.chatUri), URI.file(folder), context.turnId);
	return `Moving ${JSON.stringify(folder)} into a worktree of its own is scheduled. Request it for any other shared checkout you will change, then end this turn now without calling more tools or replying. The host will move the folders, update the session workspace, and continue the original task automatically, telling you each folder's new path; from then on, make every change to the folder there only.`;
}

function readFolderArgument(args: unknown): string | undefined {
	if (!args || typeof args !== 'object' || Array.isArray(args)) {
		return undefined;
	}
	const { folder, ...rest } = args as { folder?: unknown };
	return typeof folder === 'string' && isAbsolute(folder) && Object.keys(rest).length === 0 ? folder : undefined;
}

function isolateFolderDisplay(args: unknown): IServerToolDisplay {
	const folder = readFolderArgument(args);
	const name = folder !== undefined ? basename(URI.file(folder)) : undefined;
	return {
		displayName: localize('isolateFolder.name', "Isolate Folder in a Worktree"),
		invocationMessage: name !== undefined
			? localize('isolateFolder.invocationNamed', "Requesting a worktree for {0}", name)
			: localize('isolateFolder.invocation', "Requesting a worktree for a folder"),
		pastTenseMessage: name !== undefined
			? localize('isolateFolder.completeNamed', "Requested a worktree for {0}", name)
			: localize('isolateFolder.complete', "Requested a worktree for a folder"),
		confirmationTitle: localize('isolateFolder.confirmTitle', "Move Folder to a Worktree?"),
		confirmationMessage: name !== undefined
			? localize('isolateFolder.confirmNamed', "Move {0} to a new worktree for this chat? Other chats and the original folder stay as they are, and uncommitted edits are not copied. Skip to keep working in the shared folder.", name)
			: localize('isolateFolder.confirm', "Move this folder to a new worktree for this chat? Other chats and the original folder stay as they are, and uncommitted edits are not copied. Skip to keep working in the shared folder."),
		hideConfirmationInput: true,
	};
}
