/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUUID } from '../../../../base/common/uuid.js';
import { AgentSession } from '../../common/agent.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { MessageKind, type Message } from '../../common/state/sessionState.js';

export interface IOriginatingTrigger {
	readonly originatingTriggerId: string;
	readonly originatingTriggerSessionId: string;
	readonly originatingTriggerChatSessionId: string;
	readonly originatingTriggerKind: MessageKind.User | MessageKind.Automation;
}

export interface IToolCallSource {
	readonly session: string;
	readonly chat: string;
	readonly turnId: string;
	readonly originatingTrigger?: IOriginatingTrigger;
}

interface IDelegatedMessageAttribution {
	readonly source?: IToolCallSource;
	readonly version?: { readonly messageId: string; readonly revision: number };
}

// Key the host's evidence by the exact message version admitted, not by copyable protocol metadata.
const attribution = new WeakMap<Message, IDelegatedMessageAttribution>();

export function captureDelegatedMessage(message: Message, source: IToolCallSource | undefined, version?: IDelegatedMessageAttribution['version']): Message {
	attribution.set(message, { source, version });
	return message;
}

export function getDelegatedMessageAttribution(message: Message): IDelegatedMessageAttribution | undefined {
	return attribution.get(message);
}

/** Resolves the root once when a host request is admitted. */
export function getAdmittedOriginatingTrigger(message: Message, session: string, chat: string, turnId: string): IOriginatingTrigger | undefined {
	if (message.origin.kind === MessageKind.Agent) {
		return attribution.get(message)?.source?.originatingTrigger;
	}
	if (message.origin.kind !== MessageKind.User && message.origin.kind !== MessageKind.Automation) {
		return undefined;
	}
	const sessionId = AgentSession.id(session);
	if (!isUUID(sessionId) || !isUUID(turnId.replace(/^request_/, ''))) {
		return undefined;
	}
	return {
		originatingTriggerId: turnId,
		originatingTriggerSessionId: sessionId,
		originatingTriggerChatSessionId: getTelemetryChatSessionId(chat),
		originatingTriggerKind: message.origin.kind,
	};
}
