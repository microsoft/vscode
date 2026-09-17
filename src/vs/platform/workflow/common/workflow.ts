/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

export type WorkflowValue = string | number | boolean | null | readonly WorkflowValue[] | WorkflowObject;

export const enum WorkflowSchemaFormat {
	Uri = 'uri',
	IanaTimeZone = 'iana-time-zone',
}

export interface WorkflowObject {
	readonly [key: string]: WorkflowValue;
}

export interface WorkflowSource {
	readonly kind: 'builtin' | 'extension' | 'workspace' | 'user';
	readonly id: string;
	readonly label?: string;
	readonly uri?: string;
}

export type WorkflowInputBinding =
	| { readonly value: WorkflowValue }
	| { readonly input: string }
	| { readonly checkpoint: string; readonly outputPointer: string };

export interface WorkflowCheckDefinition {
	readonly check: string;
	readonly inputs?: Readonly<Record<string, WorkflowInputBinding>>;
	readonly options?: WorkflowObject;
}

export type WorkflowCompletionRule =
	| { readonly kind: 'reported' }
	| { readonly kind: 'checked'; readonly check: WorkflowCheckDefinition };

export interface WorkflowCheckpointType {
	readonly id: string;
	readonly version: number;
	readonly label: string;
	readonly description?: string;
	readonly instructions: string;
	readonly inputSchema?: IJSONSchema;
	readonly proofSchema: IJSONSchema;
	readonly outputSchema?: IJSONSchema;
	readonly startCondition?: WorkflowCheckDefinition;
	readonly completion: WorkflowCompletionRule;
	readonly source?: WorkflowSource;
}

export interface WorkflowCheckpoint {
	readonly id: string;
	readonly type: string;
	readonly label?: string;
	readonly instructions?: string;
	readonly inputs?: Readonly<Record<string, WorkflowInputBinding>>;
	readonly localType?: WorkflowCheckpointType;
	readonly afterCompletion?: { readonly group?: string };
}

export interface WorkflowDefinition {
	readonly id: string;
	readonly version: number;
	readonly label: string;
	readonly description?: string;
	readonly inputSchema?: IJSONSchema;
	readonly checkpoints: readonly WorkflowCheckpoint[];
	readonly source?: WorkflowSource;
}

export interface ResolvedWorkflowCheckpoint {
	readonly id: string;
	readonly type: WorkflowCheckpointType;
	readonly label: string;
	readonly instructions: string;
	readonly inputs: Readonly<Record<string, WorkflowInputBinding>>;
	readonly afterCompletion?: { readonly group?: string };
}

export interface WorkflowSnapshot {
	readonly id: string;
	readonly version: number;
	readonly label: string;
	readonly description?: string;
	readonly inputSchema?: IJSONSchema;
	readonly checkpoints: readonly ResolvedWorkflowCheckpoint[];
	readonly source?: WorkflowSource;
}

interface WorkflowEvidenceResource {
	readonly uri: string;
	readonly label: string;
}

export type WorkflowEvidence = WorkflowEvidenceResource & (
	| { readonly kind: 'file' | 'link' }
	| { readonly kind: 'pullRequest'; readonly state?: 'open' | 'closed' | 'merged' | 'draft' }
	| { readonly kind: 'issue'; readonly state?: 'open' | 'closed'; readonly stateReason?: 'completed' | 'not_planned' | 'duplicate' | 'reopened' }
);

export interface WorkflowReceipt {
	readonly id: string;
	readonly checkpointId: string;
	readonly assignmentId: string;
	readonly turnId?: string;
	readonly proof: WorkflowObject;
	readonly output: WorkflowObject;
	readonly evidence: readonly WorkflowEvidence[];
	readonly provenance: 'reported' | 'checked';
	readonly acceptedAt: number;
	readonly checkId?: string;
}

/** A historical start-condition observation, not checkpoint completion or authorization for a later dispatch. */
export interface WorkflowStartConditionReceipt {
	readonly id: string;
	readonly checkpointId: string;
	readonly assignmentId: string;
	readonly checkId: string;
	readonly output: WorkflowObject;
	readonly evidence: readonly WorkflowEvidence[];
	readonly provenance: 'checked';
	readonly observedAt: number;
}

export type WorkflowAssignmentReason = 'start' | 'previous_completed' | 'repair' | 'resume' | 'missing_proof' | 'reconcile';

export interface WorkflowAssignment {
	readonly id: string;
	readonly checkpointId: string;
	readonly turnId: string;
	readonly attempt: number;
	readonly reason: WorkflowAssignmentReason;
	readonly inputs: WorkflowObject;
	readonly createdAt: number;
	readonly delivery: 'pending' | 'dispatching' | 'running' | 'ended';
	readonly diagnostics?: string;
	readonly revoked?: boolean;
	readonly missingProofReminders?: number;
	readonly repairAttempts?: number;
}

export interface WorkflowWait {
	readonly kind: 'startCondition' | 'completion';
	readonly checkpointId: string;
	readonly reason: string;
	readonly nextCheckAt: number;
	readonly state?: WorkflowObject;
	readonly proof?: WorkflowObject;
	readonly assignmentId?: string;
	readonly turnId?: string;
}

export interface WorkflowVerification {
	readonly id: string;
	readonly kind: 'startCondition' | 'completion';
	readonly checkpointId: string;
	readonly invocation?: WorkflowInvocation;
	readonly proof?: WorkflowObject;
}

export type WorkflowRunStatus = 'running' | 'waiting' | 'stopped' | 'paused' | 'blocked' | 'completed' | 'cancelled';

export interface WorkflowRun {
	readonly id: string;
	readonly version: 1;
	readonly revision: number;
	readonly session: string;
	readonly chat: string;
	readonly workspace?: string;
	readonly task: string;
	readonly inputs: WorkflowObject;
	readonly snapshot: WorkflowSnapshot;
	readonly stopAfter: string;
	readonly status: WorkflowRunStatus;
	readonly checkpointIndex: number;
	readonly receipts: readonly WorkflowReceipt[];
	/** Retains the latest satisfied start-condition observation per checkpoint, independently of completion receipts. */
	readonly startConditionReceipts?: readonly WorkflowStartConditionReceipt[];
	readonly firstTurns: Readonly<Record<string, string>>;
	readonly assignment?: WorkflowAssignment;
	readonly pendingAssignment?: WorkflowAssignment;
	readonly inputRequest?: { readonly checkpointId: string; readonly keys: readonly string[] };
	readonly wait?: WorkflowWait;
	readonly verification?: WorkflowVerification;
	readonly lastProof?: {
		readonly invocation: WorkflowInvocation;
		readonly proof: WorkflowObject;
		readonly result: WorkflowProofResult;
	};
	readonly reason?: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	/** Last explicitly recorded user activity; control transitions, automatic work and polling do not advance session order. */
	readonly activityAt: number;
	readonly nextWakeAt?: number;
	readonly origin?: { readonly runId: string; readonly checkpointId: string };
}

export interface WorkflowStartOptions {
	readonly session: string;
	readonly chat: string;
	readonly workspace?: string;
	readonly task: string;
	readonly snapshot: WorkflowSnapshot;
	readonly stopAfter: string;
	readonly inputs?: WorkflowObject;
	readonly origin?: WorkflowRun['origin'];
}

export interface WorkflowInvocation {
	readonly runId: string;
	readonly assignmentId: string;
	readonly turnId: string;
}

export type WorkflowProofResult =
	| { readonly kind: 'accepted'; readonly receipt: WorkflowReceipt }
	| { readonly kind: 'waiting'; readonly reason: string }
	| { readonly kind: 'rejected'; readonly reason: string }
	| { readonly kind: 'blocked'; readonly reason: string }
	| { readonly kind: 'stale_assignment'; readonly reason: string };

export type WorkflowControl =
	| { readonly kind: 'pause' | 'resume' | 'cancel'; readonly runId: string; readonly revision: number }
	| { readonly kind: 'setStopAfter'; readonly runId: string; readonly revision: number; readonly checkpointId: string }
	| { readonly kind: 'provideInputs'; readonly runId: string; readonly revision: number; readonly inputs: WorkflowObject };

export interface WorkflowProgress {
	readonly runId: string;
	readonly label: string;
	readonly checkpointId: string;
	readonly checkpointLabel: string;
	/** The latest checkpoint with a dispatched turn, independently of pending work. */
	readonly lastDispatchedCheckpointLabel?: string;
	readonly position: number;
	readonly total: number;
	readonly completed: number;
	readonly status: WorkflowRunStatus;
	readonly reason?: string;
	readonly needsAttention: boolean;
	readonly activityAt: number;
	readonly firstTurnId?: string;
	readonly group?: string;
	readonly revision: number;
}

export interface IWorkflowStore {
	getRun(id: string): Promise<WorkflowRun | undefined>;
	getSessionRun(session: string): Promise<WorkflowRun | undefined>;
	listRuns(): Promise<readonly WorkflowRun[]>;
	/** Uses the due-work index without opening session transcripts or provider sessions. */
	listDueRuns(now: number, limit: number): Promise<readonly WorkflowRun[]>;
	/** Atomically enforces unique run and owning-session identities. */
	createRun(run: WorkflowRun): Promise<void>;
	/** Atomically replaces the entire record only at the expected revision; never recreates a deleted run. */
	updateRun(run: WorkflowRun, expectedRevision: number): Promise<boolean>;
	deleteSession(session: string): Promise<void>;
}

export type WorkflowDispatchReadiness =
	| { readonly kind: 'ready' }
	| { readonly kind: 'busy' }
	| { readonly kind: 'blocked'; readonly reason: string };

export interface IWorkflowExecutionAdapter {
	canDispatch(run: WorkflowRun): Promise<WorkflowDispatchReadiness>;
	/** Validates durable assignment identity at admission and resolves without waiting for turn completion. */
	dispatch(run: WorkflowRun, assignment: WorkflowAssignment, message: string): Promise<void>;
	cancel(run: WorkflowRun, assignment: WorkflowAssignment): Promise<void>;
	/** `notStarted` positively establishes that execution never began; missing acknowledgement alone is `unknown`. */
	reconcile(run: WorkflowRun, assignment: WorkflowAssignment): Promise<'running' | 'ended' | 'notStarted' | 'unknown'>;
}

export interface WorkflowCheckContext {
	readonly run: WorkflowRun;
	readonly checkpoint: ResolvedWorkflowCheckpoint;
	readonly inputs: WorkflowObject;
	readonly options: WorkflowObject;
	readonly proof?: WorkflowObject;
	readonly previousState?: WorkflowObject;
}

export type WorkflowCheckResult =
	| { readonly kind: 'satisfied'; readonly output: WorkflowObject; readonly evidence?: readonly WorkflowEvidence[] }
	| { readonly kind: 'waiting'; readonly reason: string; readonly retryAfterMs: number; readonly state?: WorkflowObject }
	| { readonly kind: 'rejected'; readonly reason: string }
	| { readonly kind: 'blocked'; readonly reason: string };

export interface IWorkflowCheck {
	readonly id: string;
	evaluate(context: WorkflowCheckContext, token: CancellationToken): Promise<WorkflowCheckResult>;
}

export interface IWorkflowCheckRegistry {
	register(check: IWorkflowCheck): IDisposable;
	get(id: string): IWorkflowCheck | undefined;
}

/** Provider adapters expose workflows without coupling clients to the owning runtime. */
export interface IWorkflowRuntime {
	readonly onDidChangeRun: Event<WorkflowRun>;
	/** Keeps full run updates active only while a view needs them. */
	watchSession?(session: string): IDisposable;
	getSessionRun(session: string): Promise<WorkflowRun | undefined>;
	start(options: WorkflowStartOptions): Promise<WorkflowRun>;
	control(control: WorkflowControl): Promise<WorkflowRun>;
}
