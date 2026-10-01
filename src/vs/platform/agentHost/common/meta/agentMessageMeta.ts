/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Message } from '../state/protocol/state.js';
import { isCopilotMessageInternal, withCopilotMessageInternal } from './copilotd/copilotdMetadataReader.js';
import { hasMessagePresentation, readMessagePresentation, withMessageHiddenFromTranscript, withMessageRequestHiddenFromTranscript as withVSCodeRequestHidden, withMessageSystemInitiatedLabel } from './vscode/agentMessageMeta.js';

export interface IAgentMessagePresentation {
	readonly hiddenFromTranscript: boolean;
	readonly requestHiddenFromTranscript: boolean;
	readonly systemInitiatedLabel?: string;
}

export function readAgentMessagePresentation(message: Message): IAgentMessagePresentation {
	return hasMessagePresentation(message) ? readMessagePresentation(message) : {
		hiddenFromTranscript: false,
		requestHiddenFromTranscript: isCopilotMessageInternal(message),
		systemInitiatedLabel: undefined,
	};
}

export function isMessageHiddenFromTranscript(message: Message): boolean {
	return readAgentMessagePresentation(message).hiddenFromTranscript;
}

export function isMessageRequestHiddenFromTranscript(message: Message): boolean {
	return readAgentMessagePresentation(message).requestHiddenFromTranscript;
}

export function readMessageSystemInitiatedLabel(message: Message): string | undefined {
	return readAgentMessagePresentation(message).systemInitiatedLabel;
}

export { withMessageHiddenFromTranscript, withMessageSystemInitiatedLabel };

export function withMessageRequestHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	const result = withVSCodeRequestHidden(message, hidden);
	return result === message ? result : withCopilotMessageInternal(result);
}

export function readAgentMessageRoundTripMetadata(message: Pick<Message, '_meta'>): Record<string, unknown> | undefined {
	return message._meta && Object.keys(message._meta).some(key => key.startsWith('copilot.')) ? message._meta : undefined;
}
