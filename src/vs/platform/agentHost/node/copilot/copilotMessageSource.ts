/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MessageOptions, MessageSource, SessionEvent } from '@github/copilot-sdk';
import type { AgentMessageProvenance } from '../../common/agentMessageProvenance.js';
import { MessageKind } from '../../common/state/sessionState.js';

/**
 * Maps who authored a message to the SDK's message source. `undefined` leaves the runtime's default, a
 * person's message. A message without resolved provenance is a person's only when its origin says so.
 */
export function toCopilotMessageSource(provenance: AgentMessageProvenance | undefined, origin: MessageKind = MessageKind.User): MessageSource | undefined {
	switch (provenance?.kind) {
		case undefined:
			return origin === MessageKind.User ? undefined : 'system';
		case 'user':
			return undefined;
		case 'automation':
			return provenance.id ? `automation-${provenance.id}` : 'system';
		case 'agent':
			return provenance.id ? `agent-${provenance.id}` : 'system';
		default:
			return 'system';
	}
}

/**
 * The SDK send options for a message a person did not author. `clientTurnId` is the host turn or
 * pending-message ID: the runtime echoes it on the message's `user.message` event and persists it, which
 * is how {@link isHostSentUserMessage} tells the message from the runtime's own injections.
 */
export function toCopilotMessageSourceOptions(source: MessageSource | undefined, clientTurnId: string | undefined): Pick<MessageOptions, 'source' | 'clientTurnId'> {
	return source === undefined ? {} : { source, ...(clientTurnId ? { clientTurnId } : {}) };
}

/** Whether the host sent this message. The runtime's own injections, such as skills and continuations, carry no caller turn ID. */
export function isHostSentUserMessage(event: SessionEvent): boolean {
	return event.type === 'user.message' && !!event.data.clientTurnId;
}
