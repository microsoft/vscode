/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ElicitationState, IChatToolInvocation } from '../chatService/chatService.js';
import type { IChatProgressResponseContent } from '../model/chatModel.js';
import { AskQuestionsToolId } from '../tools/builtinTools/askQuestionsTool.js';
import type { VoiceConfirmationType } from './voiceClientService.js';

export function isVoiceQuestionnaireInvocation(part: IChatProgressResponseContent): part is IChatToolInvocation {
	return part.kind === 'toolInvocation' && part.toolId === AskQuestionsToolId;
}

export function isPendingVoiceQuestionnaireInvocation(part: IChatProgressResponseContent): part is IChatToolInvocation {
	if (!isVoiceQuestionnaireInvocation(part)) {
		return false;
	}
	const state = part.state.get();
	return state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
		|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;
}

export function getVoiceConfirmationType(parts: readonly IChatProgressResponseContent[]): VoiceConfirmationType | undefined {
	for (let index = parts.length - 1; index >= 0; index--) {
		const part = parts[index];
		if (part.kind === 'questionCarousel' && !part.isUsed) {
			return 'questionnaire';
		}
		if (part.kind === 'elicitation2' && part.state.get() === ElicitationState.Pending) {
			return 'elicitation';
		}
		if (isPendingVoiceQuestionnaireInvocation(part)) {
			return 'questionnaire';
		}
	}

	for (let index = parts.length - 1; index >= 0; index--) {
		const part = parts[index];
		if (part.kind === 'planReview' && !part.isUsed) {
			return 'plan';
		}
		if (part.kind === 'toolInvocation') {
			const state = part.state.get();
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				return 'tool';
			}
			if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
				return 'generic';
			}
		}
		if (part.kind === 'confirmation' && !part.isUsed) {
			return 'generic';
		}
	}

	return undefined;
}
