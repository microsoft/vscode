/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import type { ISessionWorkspaceConversionService } from '../chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

export interface ISessionIsolationToolAccessor {
	readonly canIsolateSession: ISessionWorkspaceConversionService['canIsolateSession'];
	requestSessionIsolation(chat: URI, turnId: string): void;
}

export function createSessionIsolationToolGroup(accessor?: ISessionIsolationToolAccessor): IServerToolGroup {
	return {
		definitions: [{
			name: SessionServerToolName.IsolateSession,
			description: 'Isolate the current session and all its chats in one Git worktree when the user wants to continue this task in isolation. This keeps the same project, session, and conversation histories; it does not create a separate task or switch projects. Uses normal worktree creation: the original folder is unchanged, and uncommitted edits are not copied except configured worktree include-files. Only the session\'s main chat can request this operation. The host blocks new turns, waits for all active chats to finish, applies isolation to every chat, and continues the original task. Follow the tool confirmation flow. Make this the final tool call and end the turn after it succeeds; do not poll or repeat the request.',
			inputSchema: { type: 'object', properties: {} },
			mainChatOnly: true,
		}],
		isEnabled: () => true,
		isEnabledForSession: (_tool, session) => accessor?.canIsolateSession(URI.parse(session)) === true,
		canRequireConfirmation: () => true,
		getDisplay: () => ({
			displayName: localize('isolateSession.name', "Isolate Session"),
			invocationMessage: localize('isolateSession.invocation', "Requesting session isolation"),
			pastTenseMessage: localize('isolateSession.complete', "Requested session isolation"),
			confirmationTitle: localize('isolateSession.confirmTitle', "Isolate This Session?"),
			confirmationMessage: localize('isolateSession.confirm', "Continue this session and all its chats in one isolated worktree? The original folder is left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Isolation will wait for all active chats to finish."),
			hideConfirmationInput: true,
		}),
		execute: (_stateManager, context, _tool, args) => {
			if (!accessor || !context.turnId) {
				throw new Error('Session isolation requires an active turn.');
			}
			if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0) {
				throw new Error('isolate_session takes no arguments.');
			}
			accessor.requestSessionIsolation(URI.parse(context.chatUri), context.turnId);
			return 'Session isolation is scheduled. End this turn now without calling more tools or replying. The host will wait for all active chats to finish, move the entire session to one isolated worktree, and continue the original task automatically.';
		},
	};
}
