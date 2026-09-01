/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { toInitiatorTelemetry, type IAgentHostEventClassification, type IAgentHostEventTelemetry } from './agentHostTelemetryReporter.js';

/** The static changeset slot a compute was for. */
export type StaticChangesetTelemetryKind = 'branch' | 'session' | 'uncommitted';

/**
 * The result of a static changeset compute.
 * - `computed`: diffs were published.
 * - `preserved`: git was unavailable and the cached branch changeset was kept.
 * - `gitUnavailable`: git produced no diff and there is no fallback (uncommitted).
 * - `dbOpenFailed`: the session database could not be opened.
 * - `error`: the compute threw.
 */
export type StaticChangesetOutcome = 'computed' | 'preserved' | 'gitUnavailable' | 'dbOpenFailed' | 'error';

export interface IStaticChangesetTelemetryData {
	readonly kind: StaticChangesetTelemetryKind;
	readonly outcome: StaticChangesetOutcome;
	readonly durationMs: number;
	readonly isMultiRoot: boolean;
	/** Total effective working directories for the session. */
	readonly folderCount: number;
	/** The changed-file count; only meaningful (and only set) when `outcome === 'computed'`. */
	readonly fileCount?: number;
	/** Whether the incremental session-diff path was taken; `session` kind only. */
	readonly incrementalUsed?: boolean;
	/** Whether the SDK edit-tracker fallback produced the diffs; `session` kind only. */
	readonly usedEditTrackerFallback?: boolean;
}

/**
 * Emits `agentHost.changesetComputed` for a static (branch/session/uncommitted)
 * changeset. `turnId` is included when the recompute was driven by a specific
 * turn. Conditional fields are omitted when not applicable rather than sent as
 * fabricated defaults.
 */
export function reportAgentHostStaticChangesetComputed(telemetryService: ITelemetryService, session: string, turnId: string | undefined, data: IStaticChangesetTelemetryData, clientContext?: IAgentHostClientTelemetryContext): void {
	reportChangesetComputed(telemetryService, session, turnId, {
		kind: data.kind,
		outcome: data.outcome,
		durationMs: data.durationMs,
		isMultiRoot: data.isMultiRoot,
		folderCount: data.folderCount,
		...(data.fileCount !== undefined ? { fileCount: data.fileCount } : {}),
		...(data.incrementalUsed !== undefined ? { incrementalUsed: data.incrementalUsed } : {}),
		...(data.usedEditTrackerFallback !== undefined ? { usedEditTrackerFallback: data.usedEditTrackerFallback } : {}),
	}, clientContext);
}

/**
 * The result of a per-turn changeset compute.
 * - `computed`: diffs were published.
 * - `dbOpenFailed`: the session database could not be opened.
 * - `resolveFailed`: the multi-root repository split could not be resolved.
 * - `error`: the compute threw.
 */
export type TurnChangesetOutcome = 'computed' | 'dbOpenFailed' | 'resolveFailed' | 'error';

/** Multi-root fan-out metrics for a per-turn diff; absent for single-root turns. */
export interface IMultiRootTurnDiffMetrics {
	/** Unique git repositories resolved from the session's working directories; every one is diffed. */
	readonly uniqueGitFolderCount: number;
	/** Non-git working directories whose diff came from tracked edits. */
	readonly nonGitFolderCount: number;
	/** Git repositories whose git diff was unavailable and fell back to tracked edits. */
	readonly trackedEditFallbackFolderCount: number;
}

export interface ITurnChangesetTelemetryData {
	readonly outcome: TurnChangesetOutcome;
	readonly durationMs: number;
	readonly isMultiRoot: boolean;
	/** Total effective working directories for the session. */
	readonly folderCount: number;
	/** The changed-file count; only set when `outcome === 'computed'`. */
	readonly fileCount?: number;
	/** Multi-root fan-out metrics; present only for multi-root turns. */
	readonly multiRoot?: IMultiRootTurnDiffMetrics;
}

/**
 * Emits `agentHost.changesetComputed` for a per-turn changeset (`kind: 'turn'`).
 * The multi-root fan-out fields are only sent for multi-root turns; `fileCount`
 * only when computed.
 */
export function reportAgentHostTurnChangesetComputed(telemetryService: ITelemetryService, session: string, turnId: string, data: ITurnChangesetTelemetryData, clientContext?: IAgentHostClientTelemetryContext): void {
	reportChangesetComputed(telemetryService, session, turnId, {
		kind: 'turn',
		outcome: data.outcome,
		durationMs: data.durationMs,
		isMultiRoot: data.isMultiRoot,
		folderCount: data.folderCount,
		...(data.fileCount !== undefined ? { fileCount: data.fileCount } : {}),
		...(data.multiRoot ? {
			uniqueGitFolderCount: data.multiRoot.uniqueGitFolderCount,
			nonGitFolderCount: data.multiRoot.nonGitFolderCount,
			trackedEditFallbackFolderCount: data.multiRoot.trackedEditFallbackFolderCount,
		} : {}),
	}, clientContext);
}

/** The changeset kind a compute was for: a static slot, or a per-turn diff. */
export type ChangesetComputedKind = StaticChangesetTelemetryKind | 'turn';

/** The union of static and per-turn compute outcomes. */
export type ChangesetComputedOutcome = StaticChangesetOutcome | TurnChangesetOutcome;

type ChangesetComputedEvent = IAgentHostEventTelemetry & {
	provider: string;
	agentSessionId: string;
	turnId?: string;
	kind: ChangesetComputedKind;
	outcome: ChangesetComputedOutcome;
	durationMs: number;
	isMultiRoot: boolean;
	folderCount: number;
	fileCount?: number;
	incrementalUsed?: boolean;
	usedEditTrackerFallback?: boolean;
	uniqueGitFolderCount?: number;
	nonGitFolderCount?: number;
	trackedEditFallbackFolderCount?: number;
};

type ChangesetComputedClassification = IAgentHostEventClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	turnId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For a turn changeset, the turn whose changeset was computed; for a static changeset, the turn that drove the recompute when one did (absent for truncation/refresh recomputes).' };
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The changeset computed: a static slot (branch, session, or uncommitted) or a per-turn diff (turn).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The result of the compute. Static kinds: computed, preserved, gitUnavailable, dbOpenFailed, or error. Turn kind: computed, dbOpenFailed, resolveFailed, or error.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock time to compute the changeset, in milliseconds.' };
	isMultiRoot: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the session spans more than one working directory.' };
	folderCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total effective working directories for the session.' };
	fileCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of changed files; present only when the changeset was computed.' };
	incrementalUsed?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the incremental session-diff path was taken (static session kind only).' };
	usedEditTrackerFallback?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the SDK edit-tracker fallback produced the diffs instead of git (static session kind only).' };
	uniqueGitFolderCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Unique git repositories resolved and diffed; multi-root turns only.' };
	nonGitFolderCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Non-git working directories whose diff came from tracked edits; multi-root turns only.' };
	trackedEditFallbackFolderCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Git repositories whose git diff was unavailable and fell back to tracked edits; multi-root turns only.' };
	owner: 'DonJayamanne';
	comment: 'Tracks how long the agent host takes to compute a changeset (branch/session/uncommitted static slots or a per-turn diff) and its outcome, to monitor multi-root changeset performance and health.';
};

/**
 * Shared emitter for `agentHost.changesetComputed`. Correlation (`provider`,
 * `agentSessionId`) is derived from `session`; `turnId` is included when set.
 */
function reportChangesetComputed(telemetryService: ITelemetryService, session: string, turnId: string | undefined, fields: Omit<ChangesetComputedEvent, 'provider' | 'agentSessionId' | 'turnId' | keyof IAgentHostEventTelemetry>, clientContext?: IAgentHostClientTelemetryContext): void {
	telemetryService.publicLog2<ChangesetComputedEvent, ChangesetComputedClassification>('agentHost.changesetComputed', {
		...toInitiatorTelemetry(clientContext),
		provider: URI.parse(session).scheme,
		agentSessionId: AgentSession.id(session),
		...(turnId !== undefined ? { turnId } : {}),
		...fields,
	});
}
