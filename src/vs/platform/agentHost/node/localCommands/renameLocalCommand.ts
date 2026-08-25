/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri, ResponsePartKind, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { parseRenameCommand } from '../agentHostRenameCommand.js';
import { AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../shared/persistSessionMetadata.js';
import { ILocalChatCommand, ILocalChatCommandContext, ILocalChatCommandHandling, ILocalChatCommandRequest, LocalChatCommandRegistry } from './localChatCommand.js';

/**
 * The generic `/rename [title]` command: renames the session (or an individual
 * peer chat) instead of forwarding the message to the agent SDK. Intercepted
 * for every agent-host session type.
 */
export class RenameLocalCommand extends Disposable implements ILocalChatCommand {

	readonly name = 'rename';
	readonly recordsLocalTurn = true;

	constructor(private readonly _context: ILocalChatCommandContext) {
		super();
	}

	tryHandle(request: ILocalChatCommandRequest): ILocalChatCommandHandling | undefined {
		const title = parseRenameCommand(request.text);
		if (title === undefined) {
			return undefined;
		}
		return { run: async () => this._run(request.turnChannel, request.turnId, title), suggestedTitle: title };
	}

	private _run(channel: ProtocolURI, turnId: string, title: string): void {
		if (title.length === 0) {
			// `/rename` with no title: nothing to change; the dispatcher still
			// completes the turn.
			return;
		}
		const chatTarget = isAhpChatChannel(channel) ? channel : undefined;
		const sessionChannel = isAhpChatChannel(channel) ? parseRequiredSessionUriFromChatUri(channel) : channel;
		if (chatTarget) {
			this._context.updateChatTitle(sessionChannel, chatTarget, title);
			this._context.markTitleRenamed(sessionChannel, chatTarget);
			this._context.persistSessionFlag(sessionChannel, customChatTitleMetadataKey(chatTarget), title);
			this._context.persistSessionFlag(sessionChannel, customChatTitleSourceMetadataKey(chatTarget), AGENT_HOST_TITLE_SOURCE_USER);
			if (isDefaultChatUri(chatTarget)) {
				this._context.dispatch(sessionChannel, { type: ActionType.SessionTitleChanged, title });
				this._context.markTitleRenamed(sessionChannel);
				this._context.persistSessionFlag(sessionChannel, SESSION_CUSTOM_TITLE_KEY, title);
				this._context.persistSessionFlag(sessionChannel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
			}
		} else {
			this._context.dispatch(sessionChannel, { type: ActionType.SessionTitleChanged, title });
			this._context.markTitleRenamed(sessionChannel);
			// Server-dispatched actions bypass `handleAction`, so persist the
			// new title here directly (the client-dispatched rename path relies
			// on the `SessionTitleChanged` case in `handleAction` instead).
			this._context.persistSessionFlag(sessionChannel, SESSION_CUSTOM_TITLE_KEY, title);
			this._context.persistSessionFlag(sessionChannel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
		}
		// Acknowledge the rename with a brief response so the turn has visible
		// content in the transcript.
		this._context.dispatch(channel, {
			type: ActionType.ChatResponsePart,
			turnId,
			part: {
				kind: ResponsePartKind.Markdown,
				id: generateUuid(),
				content: localize('agentHostRename.renamed', "Renamed: {0}", title),
			},
		});
	}
}

LocalChatCommandRegistry.register(RenameLocalCommand);
