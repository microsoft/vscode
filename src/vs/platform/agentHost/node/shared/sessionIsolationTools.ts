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
	/** Moves an additional folder of `chat` into a worktree of its own and returns the folder to work in; the chat continues in a new turn after `turnId`. */
	isolateChatFolder?(session: URI, chat: URI, folder: URI, turnId: string): Promise<URI>;
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
			description: 'Move one additional folder of the current chat into a Git worktree of its own, on a new branch created from the folder\'s current branch, and return the folder to work in. Call it only after the user chose to isolate the folder rather than work in place, on its own, before any tool that creates, edits or deletes files or runs commands that change files, in an additional folder that the working directories list as a shared checkout, not isolated. Not needed for reading, for the primary folder, which is already isolated, or for folders that are not in a Git repository. The chat\'s folder is replaced by the worktree; the original checkout is left unchanged, and its uncommitted changes are not copied except configured worktree include-files. Folders in the same checkout share one worktree; a checkout of a repository the session already has a worktree of gets a worktree of its own. The worktree becomes writable in the next turn: after it succeeds, isolate any other shared checkout you will change, then end this turn without changing files; the host continues the task automatically, and from then on every change to that folder is made in the returned path only. Calling it again for the same folder returns the same path.',
			inputSchema: {
				type: 'object',
				properties: {
					folder: { type: 'string', description: 'The absolute path of the additional folder, as listed in the working directories.' },
				},
				required: ['folder'],
			},
			topLevelChatOnly: true,
		}],
		isEnabled: () => true,
		isEnabledForSession: (tool, session) => tool === SessionServerToolName.IsolateFolder
			? accessor?.supportsFolderIsolation?.(URI.parse(session)) === true
			: accessor?.supportsChatIsolation(URI.parse(session)) === true,
		canRequireConfirmation: tool => tool === SessionServerToolName.IsolateSession,
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

async function isolateFolder(accessor: ISessionIsolationToolAccessor | undefined, context: IServerToolExecutionContext, args: unknown): Promise<string> {
	const folder = readFolderArgument(args);
	if (!accessor?.isolateChatFolder || folder === undefined) {
		throw new Error(`${SessionServerToolName.IsolateFolder} takes the absolute path of one additional folder of this chat as 'folder'.`);
	}
	if (!context.turnId) {
		throw new Error(localize('isolateFolder.activeTurnRequired', "Isolating a folder with this tool requires an active turn."));
	}
	const isolated = await accessor.isolateChatFolder(URI.parse(context.sessionUri), URI.parse(context.chatUri), URI.file(folder), context.turnId);
	return `The folder is now isolated in the worktree ${JSON.stringify(isolated.fsPath)}, which becomes writable in the next turn. Isolate any other shared checkout you will change, then end this turn now without changing files or replying. The host continues the task automatically; from then on, make every change to this folder in ${JSON.stringify(isolated.fsPath)} only.`;
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
			? localize('isolateFolder.invocationNamed', "Creating a worktree for {0}", name)
			: localize('isolateFolder.invocation', "Creating a worktree for a folder"),
		pastTenseMessage: name !== undefined
			? localize('isolateFolder.completeNamed', "Created a worktree for {0}", name)
			: localize('isolateFolder.complete', "Created a worktree for a folder"),
	};
}
