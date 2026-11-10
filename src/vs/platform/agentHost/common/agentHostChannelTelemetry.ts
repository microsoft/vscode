/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

/** Why windowed delivery failed. Bounded so it can be sent as telemetry. */
export const enum AgentHostChannelErrorCode {
	/** A `channel/credit` released more than was sent. */
	InvalidCredit = 'invalidCredit',
	/** A malformed, mismatched, or out-of-order notification or fragment. */
	InvalidMessage = 'invalidMessage',
	/** A data message or fragment exceeded the frame limit or the window. */
	ReceiveLimitExceeded = 'receiveLimitExceeded',
	/** One complete message exceeded the channel's per-message bound. */
	MessageLimitExceeded = 'messageLimitExceeded',
	/** Queued or retained data exceeded the channel's backlog bound. */
	BacklogLimitExceeded = 'backlogLimitExceeded',
	/** A control message exceeded its size, rate, or queue bounds. */
	ControlLimitExceeded = 'controlLimitExceeded',
	/** Data arrived before the subscription's first `channel/snapshot`. */
	DataBeforeSnapshot = 'dataBeforeSnapshot',
	/** A `channel/snapshot` was invalid for the channel. */
	InvalidSnapshot = 'invalidSnapshot',
	/** The channel was closed deliberately by its owner. Not reported as a failure. */
	Closed = 'closed',
}

/** An error from windowed delivery with a {@link AgentHostChannelErrorCode}. */
export class AgentHostChannelError extends Error {
	constructor(readonly code: AgentHostChannelErrorCode, message: string) {
		super(message);
	}
}

type AgentHostChannelKind = 'chat' | 'session' | 'terminal' | 'automation' | 'changeset' | 'annotations' | 'tcp' | 'control' | 'other';

/** Coarse channel kind for logs and telemetry; never the channel URI itself. */
function getChannelKind(channel: string | undefined): AgentHostChannelKind {
	if (channel === undefined) {
		return 'control';
	}
	if (channel.startsWith('ahp-tcp:')) {
		return 'tcp';
	}
	if (/\/changeset\/|changeset:/.test(channel)) {
		return 'changeset';
	}
	if (channel.endsWith('/annotations')) {
		return 'annotations';
	}
	if (channel.startsWith('ahp-chat:')) {
		return 'chat';
	}
	if (channel.startsWith('ahp-automation')) {
		return 'automation';
	}
	if (/terminal:/.test(channel)) {
		return 'terminal';
	}
	if (channel.startsWith('ahp-session:') || /^[a-z][a-z0-9+.-]*:\/[^/]+$/.test(channel)) {
		return 'session';
	}
	return 'other';
}

type AgentHostChannelFailureEvent = {
	role: string;
	channelKind: string;
	code: string;
	closedTransport: boolean;
};

type AgentHostChannelFailureClassification = {
	role: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the agent host (`host`) or a client (`client`) detected the failure.' };
	channelKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Coarse kind of the failed windowed channel, such as chat, terminal, or tcp; `control` for the shared control lane.' };
	code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason the windowed delivery failed, or `other`.' };
	closedTransport: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the failure closed the whole connection rather than resetting only the channel.' };
	owner: 'connor4312';
	comment: 'Windowed Agent Host Protocol delivery failures that dropped a connection or channel.';
};

/**
 * Logs and reports a windowed delivery failure that this side caused: it
 * closed the transport or reset the channel. Deliberate closes are ignored.
 *
 * @param channel The failed channel, or `undefined` for the shared control lane.
 */
export function reportAgentHostChannelFailure(logService: ILogService, telemetryService: ITelemetryService, role: 'host' | 'client', channel: string | undefined, error: Error, closedTransport: boolean): void {
	const code = error instanceof AgentHostChannelError ? error.code : 'other';
	if (code === AgentHostChannelErrorCode.Closed) {
		return;
	}
	const channelKind = getChannelKind(channel);
	logService.warn(`[AgentHostChannels] ${channel ?? 'Control lane'} failed (${code}); ${closedTransport ? 'closing the connection' : 'resetting the channel'}: ${error.message}`);
	telemetryService.publicLog2<AgentHostChannelFailureEvent, AgentHostChannelFailureClassification>('agentHost.channelFailure', { role, channelKind, code, closedTransport });
}
