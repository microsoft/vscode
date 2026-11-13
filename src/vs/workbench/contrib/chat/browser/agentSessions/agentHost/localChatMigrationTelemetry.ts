/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CLOUD_SANDBOX_TASK_SCHEME, isRemoteAgentHostSessionType } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { SessionType } from '../../../common/chatSessionsService.js';

/** Where a Local chat is moved from: the Move to Copilot action, or Continue In. */
export type LocalChatMigrationEntryPoint = 'move' | 'continueIn';

/** Whether the move ran on its own (e.g. when a policy requires Copilot) or the user started it. */
export type LocalChatMigrationTrigger = 'automatic' | 'manual';

/**
 * What the move carries: the conversation as editable history, the conversation
 * as an attached transcript (the target cannot import history), or only the
 * unsent draft (the chat had no requests).
 */
export type LocalChatMigrationKind = 'migrate' | 'transcript' | 'newChat';

/** Where the moved chat is shown. */
export type LocalChatMigrationLocation = 'panel' | 'editor' | 'agentsWindow';

/**
 * The agent a Local chat is moved to: a built-in agent host session type, or a
 * fixed category for other agent hosts. A remote agent host's session type contains
 * the host's address, so it is never reported.
 */
export type LocalChatMigrationTarget =
	| typeof SessionType.AgentHostCopilot
	| typeof SessionType.AgentHostClaude
	| typeof SessionType.AgentHostCodex
	| typeof CLOUD_SANDBOX_TASK_SCHEME
	| 'remoteAgentHost'
	| 'otherAgentHost';

/** Maps the session type a Local chat is moved to onto a value that is safe to report. */
export function getLocalChatMigrationTarget(sessionType: string): LocalChatMigrationTarget {
	switch (sessionType) {
		case SessionType.AgentHostCopilot:
		case SessionType.AgentHostClaude:
		case SessionType.AgentHostCodex:
		case CLOUD_SANDBOX_TASK_SCHEME:
			return sessionType;
	}
	return isRemoteAgentHostSessionType(sessionType) ? 'remoteAgentHost' : 'otherAgentHost';
}

/**
 * The step a move failed at. These are code-defined so they can be counted;
 * error messages and resources are never reported.
 */
export type LocalChatMigrationFailureReason =
	/** A request was still running in the source chat. */
	| 'requestInProgress'
	/** The source chat could not be found in the sessions list. */
	| 'sourceMissing'
	/** The source chat was already archived, so it was already moved. */
	| 'sourceArchived'
	/** The target agent cannot open chats. */
	| 'targetUnavailable'
	/** The new chat's session could not be prepared. */
	| 'prepareFailed'
	/** The host rejected the imported conversation. */
	| 'importFailed'
	/** The new chat's session item was not created. */
	| 'sessionNotCreated'
	/** The new chat did not open. */
	| 'openFailed'
	/** The new chat opened, but the request carrying the conversation was rejected or failed to send. */
	| 'sendFailed'
	/** The new chat opened without the moved conversation. */
	| 'historyMissing'
	/** An error at a step that is not recorded. */
	| 'unexpected';

type LocalChatMigrationEvent = {
	entryPoint: LocalChatMigrationEntryPoint;
	trigger: LocalChatMigrationTrigger;
	policyRequired: boolean;
	kind: LocalChatMigrationKind;
	target: LocalChatMigrationTarget;
	location: LocalChatMigrationLocation;
	outcome: 'started' | 'succeeded' | 'failed' | 'cancelled';
	failureReason: LocalChatMigrationFailureReason | 'none';
	turns: number;
	durationMs: number;
};

type LocalChatMigrationClassification = {
	owner: 'vijayupadya';
	comment: 'Tracks attempts to move a Local chat into an agent-host session and how they end, whatever started them, so the number of moves, their success rate and why they fail can be measured. Concurrent duplicate attempts for the same chat are counted once.';
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the chat was moved by the Move to Copilot action or by Continue In.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the move ran automatically or the user started it.' };
	policyRequired: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an organization policy required the Copilot agent when the move was attempted.' };
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the conversation was moved as editable history, attached as a transcript because the target cannot import it, or only the unsent draft was carried because the chat had no requests.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The built-in agent host session type the chat was moved to, or a fixed category for other (including remote) agent hosts. Host addresses are never reported.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the moved chat is shown in the chat panel, an editor, or the Agents window.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A started attempt, or whether it succeeded, failed or was cancelled.' };
	failureReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'For a failed attempt, the code-defined step it failed at; otherwise none.' };
	turns: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of conversation turns the move carries as history.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time from the start of the attempt to its outcome in milliseconds, or 0 when it started.' };
};

/** What an attempt to move a Local chat reports with every event. */
export interface ILocalChatMigrationAttempt {
	readonly entryPoint: LocalChatMigrationEntryPoint;
	readonly trigger: LocalChatMigrationTrigger;
	readonly policyRequired: boolean;
	readonly kind: LocalChatMigrationKind;
	readonly target: LocalChatMigrationTarget;
	readonly location: LocalChatMigrationLocation;
	readonly turns: number;
}

/**
 * Reports one attempt to move a Local chat into an agent-host session: that it
 * started, then once how it ended. Later outcomes are ignored, so a caller can
 * report a specific failure and still fall back to a general one.
 */
export class LocalChatMigrationTelemetry {
	private readonly startedAt = Date.now();
	private ended = false;

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly attempt: ILocalChatMigrationAttempt,
	) {
		this.log('started', 'none', 0);
	}

	succeeded(): void {
		this.end('succeeded', 'none');
	}

	failed(reason: LocalChatMigrationFailureReason): void {
		this.end('failed', reason);
	}

	cancelled(): void {
		this.end('cancelled', 'none');
	}

	private end(outcome: 'succeeded' | 'failed' | 'cancelled', failureReason: LocalChatMigrationFailureReason | 'none'): void {
		if (this.ended) {
			return;
		}
		this.ended = true;
		this.log(outcome, failureReason, Math.max(0, Date.now() - this.startedAt));
	}

	private log(outcome: LocalChatMigrationEvent['outcome'], failureReason: LocalChatMigrationEvent['failureReason'], durationMs: number): void {
		this.telemetryService.publicLog2<LocalChatMigrationEvent, LocalChatMigrationClassification>('chat.localChatMigration', {
			...this.attempt,
			outcome,
			failureReason,
			durationMs,
		});
	}
}

/** Why a Local chat that is offered to be moved cannot import its conversation, if it cannot. */
export type LocalChatMigrationBlockedReason = 'none' | 'importUnsupported';

type LocalChatMigrationOfferedEvent = {
	policyRequired: boolean;
	hasRequests: boolean;
	archived: boolean;
	blockedReason: LocalChatMigrationBlockedReason;
	remoteExtensionHost: boolean;
	location: LocalChatMigrationLocation;
};

type LocalChatMigrationOfferedClassification = {
	owner: 'vijayupadya';
	comment: 'Tracks Local chats offered to be moved into an agent-host session, once per chat in each chat view, to measure how many chats are waiting to be moved and how many cannot be.';
	policyRequired: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the chat is offered because an organization policy requires the Copilot agent.' };
	hasRequests: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the chat has a conversation to move, rather than only an unsent draft.' };
	archived: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the chat is archived and is offered again, for example because its conversation could not be imported earlier.' };
	blockedReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the conversation cannot be imported, so only a transcript can be attached; none when it can be imported.' };
	remoteExtensionHost: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the window connects to its agent host through a remote extension host, such as SSH, WSL or a container.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the chat is shown in the chat panel, an editor, or the Agents window.' };
};

/** Reports that a Local chat is offered to be moved into an agent-host session. */
export function logLocalChatMigrationOffered(telemetryService: ITelemetryService, event: LocalChatMigrationOfferedEvent): void {
	telemetryService.publicLog2<LocalChatMigrationOfferedEvent, LocalChatMigrationOfferedClassification>('chat.localChatMigrationOffered', event);
}
