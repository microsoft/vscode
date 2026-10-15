/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

export interface ISessionIsolationToolAccessor {
	/** Stable provider support; exact-chat eligibility is checked when requesting isolation. */
	supportsChatIsolation(session: URI): boolean;
	requestChatIsolation(chat: URI, turnId: string): void;
}

export function createSessionIsolationToolGroup(accessor?: ISessionIsolationToolAccessor): IServerToolGroup {
	return {
		definitions: [{
			name: SessionServerToolName.IsolateSession,
			description: 'Move only the current chat to a new Git worktree when the user wants to continue this task without changing its current checkout. This preserves the chat and its history; it does not create a separate task or move other chats, even those sharing the same folder. The session workspace will include the new worktree. The original folder is unchanged, and uncommitted edits are not copied except configured worktree include-files. Requires a chat working in one local Git folder. Follow the tool confirmation flow. Make this the final tool call and end the turn after it succeeds; the host then moves this chat and continues its task automatically. Do not poll or repeat the request.',
			inputSchema: { type: 'object', properties: {} },
			topLevelChatOnly: true,
			deferLoading: true,
		}],
		isEnabled: () => true,
		isEnabledForSession: (_tool, session) => accessor?.supportsChatIsolation(URI.parse(session)) === true,
		canRequireConfirmation: () => true,
		getDisplay: () => ({
			displayName: localize('isolateSession.name', "Change Workspace to a New Worktree"),
			invocationMessage: localize('isolateSession.invocation', "Requesting a workspace change to a new worktree"),
			pastTenseMessage: localize('isolateSession.complete', "Requested a workspace change to a new worktree"),
			confirmationTitle: localize('isolateSession.confirmTitle', "Change Workspace?"),
			confirmationMessage: localize('isolateSession.confirm', "Change only this chat's workspace to a new worktree? Other chats and the original folder are left unchanged. Uncommitted edits are not copied, except configured worktree include-files."),
			hideConfirmationInput: true,
		}),
		execute: (_stateManager, context, _tool, args) => {
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
