/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ResponsePartKind, type ChatInputAnswer, type ChatState, type URI } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/** A yes/no question a server tool asks the person in its chat while it runs. */
export interface IServerToolConfirmation {
	readonly title: string;
	/** Plain text; blank lines separate paragraphs. */
	readonly message: string;
	readonly confirmLabel: string;
	readonly declineLabel: string;
}

const QUESTION_ID = 'decision';
const CONFIRM_OPTION_ID = 'confirm';
const DECLINE_OPTION_ID = 'decline';

/** Whether an input request is a server tool's own confirmation, which no provider should answer or receive. */
export function isServerToolConfirmation(state: ChatState | undefined, requestId: string): boolean {
	const part = state?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.InputRequest && part.request.id === requestId);
	return part?.kind === ResponsePartKind.InputRequest && readChatInputRequestPurpose(part.request) === ChatInputRequestPurpose.ServerToolConfirmation;
}

/**
 * Asks the person in `chat` to confirm through the turn's input request, which tool auto-approval cannot answer.
 * Resolves `false` when they decline or cancel, or when the turn ends first.
 */
export function requestServerToolConfirmation(stateManager: AgentHostStateManager, chat: URI, turnId: string, confirmation: IServerToolConfirmation): Promise<boolean> {
	const requestId = generateUuid();
	return new Promise<boolean>(resolve => {
		const store = new DisposableStore();
		const settle = (confirmed: boolean) => {
			store.dispose();
			resolve(confirmed);
		};
		store.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel !== chat || envelope.rejectionReason) {
				return;
			}
			const action = envelope.action;
			if (action.type === ActionType.ChatInputCompleted && action.requestId === requestId) {
				settle(action.response === ChatInputResponseKind.Accept && isConfirmed(action.answers?.[QUESTION_ID]));
			} else if ((action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatTurnCancelled || action.type === ActionType.ChatError) && action.turnId === turnId) {
				settle(false);
			}
		}));
		stateManager.dispatchServerAction(chat, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: requestId,
				questions: [{
					id: QUESTION_ID,
					kind: ChatInputQuestionKind.SingleSelect,
					title: confirmation.title,
					// Clients render the message as untrusted Markdown; integration text must stay literal.
					message: escapeMarkdownSyntaxTokens(confirmation.message),
					required: true,
					allowFreeformInput: false,
					options: [
						{ id: CONFIRM_OPTION_ID, label: confirmation.confirmLabel },
						{ id: DECLINE_OPTION_ID, label: confirmation.declineLabel },
					],
				}],
			}, ChatInputRequestPurpose.ServerToolConfirmation),
		});
		// The request only attaches to a running turn; without one, nobody can confirm.
		const chatState = stateManager.getChatState(chat);
		if (chatState?.activeTurn?.id !== turnId || !isServerToolConfirmation(chatState, requestId)) {
			settle(false);
		}
	});
}

function isConfirmed(answer: ChatInputAnswer | undefined): boolean {
	return answer?.state === ChatInputAnswerState.Submitted && answer.value.kind === ChatInputAnswerValueKind.Selected && answer.value.value === CONFIRM_OPTION_ID;
}
