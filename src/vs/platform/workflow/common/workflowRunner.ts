/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { deepFreeze } from '../../../base/common/objects.js';
import { hasKey } from '../../../base/common/types.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { buildWorkflowPrompt } from './workflowPrompt.js';
import { IWorkflowCheckRegistry, IWorkflowExecutionAdapter, IWorkflowRuntime, IWorkflowStore, ResolvedWorkflowCheckpoint, WorkflowAssignment, WorkflowAssignmentReason, WorkflowCheckDefinition, WorkflowCheckResult, WorkflowControl, WorkflowEvidence, WorkflowInvocation, WorkflowObject, WorkflowProofResult, WorkflowReceipt, WorkflowRun, WorkflowStartConditionReceipt, WorkflowStartOptions, WorkflowVerification } from './workflow.js';
import { getMissingWorkflowInputs, resolveWorkflowBindings, validateWorkflowEvidence, validateWorkflowInputs, validateWorkflowObject, validateWorkflowRun, validateWorkflowSnapshot, validateWorkflowValue, WorkflowValidationError } from './workflowValidation.js';

export type WorkflowTurnOutcome = 'completed' | 'cancelled' | 'error';

export interface WorkflowRunnerOptions {
	readonly now?: () => number;
	readonly generateId?: () => string;
	readonly dispatchRetryMs?: number;
	readonly checkLeaseMs?: number;
	/** Maximum age of a positive start-condition observation when claiming a dispatch. */
	readonly startConditionMaxAgeMs?: number;
	readonly reconcileIntervalMs?: number;
	readonly maxRepairAttempts?: number;
	readonly maxMissingProofReminders?: number;
	readonly wakeBatchSize?: number;
}

export class WorkflowConflictError extends Error {
	constructor(readonly runId: string) {
		super(localize('workflow.conflict', "Workflow '{0}' changed. Refresh its state before trying again.", runId));
		this.name = 'WorkflowConflictError';
	}
}

/** Signals a busy race only when provider execution has definitely not begun. */
export class WorkflowDispatchBusyError extends Error {
	constructor() {
		super(localize('workflow.dispatchBusy', "The session is busy with another turn."));
		this.name = 'WorkflowDispatchBusyError';
	}
}

interface VerificationRequest {
	readonly run: WorkflowRun;
	readonly checkpoint: ResolvedWorkflowCheckpoint;
	readonly check: WorkflowCheckDefinition;
	readonly verification: WorkflowVerification;
	readonly previousState?: WorkflowObject;
}

interface ProofOperation {
	readonly invocation: WorkflowInvocation;
	readonly proof: WorkflowObject;
	readonly promise: Promise<WorkflowProofResult>;
}

class WorkflowMissingRunError extends Error {
	constructor(id: string) {
		super(localize('workflow.missingRun', "Workflow '{0}' does not exist or its session was deleted.", id));
	}
}

const staleAssignment = (): WorkflowProofResult => ({
	kind: 'stale_assignment',
	reason: localize('workflow.staleAssignment', "This workflow assignment is no longer current. End the turn without continuing the workflow."),
});

function invocationMatches(assignment: WorkflowAssignment | undefined, invocation: WorkflowInvocation): boolean {
	return assignment?.id === invocation.assignmentId && assignment.turnId === invocation.turnId;
}

function live(run: WorkflowRun): boolean {
	return run.status === 'running' || run.status === 'waiting';
}

function activeTurn(run: WorkflowRun): boolean {
	return run.assignment?.delivery === 'running' || run.assignment?.delivery === 'dispatching';
}

function copy<T>(value: T): T {
	return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

/** All state writes are short CAS transitions; provider calls and read-only checks run outside those transitions. */
export class WorkflowRunner extends Disposable implements IWorkflowRuntime {
	private readonly changeEmitter = this._register(new Emitter<WorkflowRun>());
	readonly onDidChangeRun = this.changeEmitter.event;
	private readonly checkTokens = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly mutations = new Map<string, Promise<void>>();
	private readonly workers = new Map<string, Promise<void>>();
	private readonly redrive = new Set<string>();
	private readonly proofs = new Map<string, ProofOperation>();
	private waking: Promise<void> | undefined;
	private readonly now: () => number;
	private readonly generateId: () => string;
	private readonly dispatchRetryMs: number;
	private readonly checkLeaseMs: number;
	private readonly startConditionMaxAgeMs: number;
	private readonly reconcileIntervalMs: number;
	private readonly maxRepairAttempts: number;
	private readonly maxMissingProofReminders: number;
	private readonly wakeBatchSize: number;

	constructor(
		private readonly store: IWorkflowStore,
		private readonly adapter: IWorkflowExecutionAdapter,
		private readonly checks: IWorkflowCheckRegistry,
		options: WorkflowRunnerOptions = {},
	) {
		super();
		this.now = options.now ?? Date.now;
		this.generateId = options.generateId ?? generateUuid;
		this.dispatchRetryMs = options.dispatchRetryMs ?? 1000;
		this.checkLeaseMs = options.checkLeaseMs ?? 60000;
		this.startConditionMaxAgeMs = options.startConditionMaxAgeMs ?? 30000;
		this.reconcileIntervalMs = options.reconcileIntervalMs ?? 30000;
		this.maxRepairAttempts = options.maxRepairAttempts ?? 2;
		this.maxMissingProofReminders = options.maxMissingProofReminders ?? 1;
		this.wakeBatchSize = options.wakeBatchSize ?? 100;
		for (const value of [this.dispatchRetryMs, this.checkLeaseMs, this.startConditionMaxAgeMs, this.reconcileIntervalMs, this.wakeBatchSize]) {
			if (!Number.isSafeInteger(value) || value <= 0) {
				throw new Error(localize('workflow.invalidRunnerOption', "Workflow timing and batch options must be positive integers."));
			}
		}
		for (const value of [this.maxRepairAttempts, this.maxMissingProofReminders]) {
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new Error(localize('workflow.invalidRetryOption', "Workflow retry limits must be non-negative integers."));
			}
		}
	}

	async getSessionRun(session: string): Promise<WorkflowRun | undefined> {
		this.assertAlive();
		const run = await this.store.getSessionRun(session);
		if (run !== undefined) {
			validateWorkflowRun(run);
			return copy(run);
		}
		return undefined;
	}

	/** Reads the original checkpoint for a live owned turn without advancing or dispatching work. */
	async getCheckpoint(invocation: WorkflowInvocation): Promise<ResolvedWorkflowCheckpoint | undefined> {
		const run = await this.readRun(invocation.runId);
		const assignment = run?.assignment;
		if (!run || !assignment || run.id !== invocation.runId || !invocationMatches(assignment, invocation)
			|| assignment.revoked || !activeTurn(run) || ['paused', 'blocked', 'cancelled'].includes(run.status)) {
			return undefined;
		}
		return run.snapshot.checkpoints.find(checkpoint => checkpoint.id === assignment.checkpointId);
	}

	/** Records admitted user activity without waking execution; duplicate or older timestamps are ignored. */
	async recordUserActivity(runId: string, at: number = this.now()): Promise<WorkflowRun> {
		validateWorkflowValue(at, { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
		return this.mutate(runId, async run => {
			if (at <= run.activityAt) {
				return run;
			}
			return this.save(run, { activityAt: at });
		});
	}

	async start(options: WorkflowStartOptions): Promise<WorkflowRun> {
		this.assertAlive();
		validateWorkflowSnapshot(options.snapshot);
		validateWorkflowInputs(options.inputs ?? {}, options.snapshot.inputSchema);
		const startOptions = copy(options);
		const run = await this.serialize(`session:${startOptions.session}`, async () => {
			const existing = await this.store.getSessionRun(startOptions.session);
			if (existing !== undefined) {
				validateWorkflowRun(existing);
				throw new Error(localize('workflow.sessionAlreadyOwned', "This session already has a workflow. Start an independent workflow in a new session."));
			}
			const now = this.now();
			const initial: WorkflowRun = {
				id: this.generateId(),
				version: 1,
				revision: 0,
				session: startOptions.session,
				chat: startOptions.chat,
				workspace: startOptions.workspace,
				task: startOptions.task,
				inputs: startOptions.inputs ?? {},
				snapshot: startOptions.snapshot,
				stopAfter: startOptions.stopAfter,
				status: 'running',
				checkpointIndex: 0,
				receipts: [],
				startConditionReceipts: [],
				firstTurns: {},
				createdAt: now,
				updatedAt: now,
				activityAt: now,
				nextWakeAt: now,
				origin: startOptions.origin,
			};
			validateWorkflowRun(initial);
			const created = copy({ ...initial, ...this.prepareAssignment(initial, 'start') });
			await this.store.createRun(created);
			this.changeEmitter.fire(created);
			return created;
		});
		await this.drive(run.id);
		return this.requireRun(run.id);
	}

	async control(control: WorkflowControl): Promise<WorkflowRun> {
		let cancellation: { run: WorkflowRun; assignment: WorkflowAssignment } | undefined;
		const updated = await this.mutate(control.runId, async run => {
			if (run.revision !== control.revision) {
				throw new WorkflowConflictError(run.id);
			}
			let next = run;
			switch (control.kind) {
				case 'pause':
				case 'cancel': {
					if (run.status === 'completed' || run.status === 'cancelled') {
						throw new Error(localize('workflow.terminalControl', "A completed or cancelled workflow cannot be changed."));
					}
					next = await this.save(run, {
						status: control.kind === 'pause' ? 'paused' : 'cancelled',
						assignment: run.assignment && { ...run.assignment, revoked: true },
						pendingAssignment: undefined,
						inputRequest: control.kind === 'cancel' ? undefined : run.inputRequest,
						verification: undefined,
						wait: control.kind === 'cancel' ? undefined : run.wait,
						lastProof: undefined,
						nextWakeAt: undefined,
						reason: undefined,
					});
					break;
				}
				case 'setStopAfter': {
					const stop = run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === control.checkpointId);
					if (stop < 0 || run.status === 'cancelled' || run.status === 'completed') {
						throw new Error(localize('workflow.invalidStop', "Choose a checkpoint in an unfinished workflow."));
					}
					const outsideBoundary = run.checkpointIndex > stop;
					const revoke = outsideBoundary && run.assignment?.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id;
					const state: WorkflowRun = {
						...run,
						stopAfter: control.checkpointId,
						status: outsideBoundary && (live(run) || run.status === 'blocked' && run.inputRequest) ? 'stopped' : run.status === 'stopped' && !outsideBoundary ? 'running' : run.status,
						assignment: revoke && run.assignment ? { ...run.assignment, revoked: true } : run.assignment,
						pendingAssignment: outsideBoundary ? undefined : run.pendingAssignment,
						inputRequest: outsideBoundary ? undefined : run.inputRequest,
						wait: outsideBoundary ? undefined : run.wait,
						verification: outsideBoundary ? undefined : run.verification,
						lastProof: revoke ? undefined : run.lastProof,
						nextWakeAt: outsideBoundary ? undefined : run.nextWakeAt,
					};
					next = await this.save(run, {
						...state,
						nextWakeAt: live(state) ? state.nextWakeAt ?? this.now() : undefined,
						...(live(state) && !state.pendingAssignment && (!this.unfinishedAssignment(state) || state.assignment?.delivery === 'ended' && state.assignment.revoked) && !outsideBoundary
							? this.prepareAssignment(state, 'resume', this.unfinishedAssignment(state) ? state.assignment : undefined) : {}),
					});
					break;
				}
				case 'resume': {
					if (!['paused', 'blocked', 'stopped'].includes(run.status)) {
						throw new Error(localize('workflow.invalidResume', "Only a paused, blocked or stopped workflow can be resumed."));
					}
					const withinBoundary = this.withinBoundary(run);
					const state: WorkflowRun = {
						...run,
						status: withinBoundary ? run.wait ? 'waiting' : 'running' : 'stopped',
						reason: undefined,
						inputRequest: undefined,
						verification: undefined,
						lastProof: undefined,
						nextWakeAt: withinBoundary ? this.now() : undefined,
					};
					const previous = this.unfinishedAssignment(state) ? state.assignment : undefined;
					next = await this.save(run, {
						...state,
						wait: state.wait && { ...state.wait, nextCheckAt: this.now() },
						...(withinBoundary && (!state.wait || state.wait.kind === 'startCondition') && (!activeTurn(state) || run.inputRequest)
							? this.prepareAssignment(state, 'resume', previous) : {}),
					});
					break;
				}
				case 'provideInputs': {
					if (run.status !== 'blocked' || !run.inputRequest || !this.withinBoundary(run)) {
						throw new Error(localize('workflow.noInputRequest', "This workflow is not waiting for checkpoint inputs. Refresh its state before continuing."));
					}
					validateWorkflowObject(control.inputs);
					if (Object.keys(control.inputs).some(key => !run.inputRequest!.keys.includes(key))) {
						throw new Error(localize('workflow.unrequestedInput', "Only the inputs requested by this checkpoint can be supplied. Existing workflow inputs cannot be changed."));
					}
					const inputs = { ...run.inputs, ...control.inputs };
					validateWorkflowInputs(inputs, run.snapshot.inputSchema);
					const state: WorkflowRun = { ...run, inputs, status: 'running', inputRequest: undefined, reason: undefined, nextWakeAt: this.now() };
					if (getMissingWorkflowInputs(state).length) {
						throw new Error(localize('workflow.inputsRequired', "Provide all inputs requested by this checkpoint."));
					}
					next = await this.save(run, { ...state, ...this.prepareAssignment(state, 'resume') });
					break;
				}
				default:
					throw new Error(localize('workflow.invalidControl', "Unsupported workflow control."));
			}
			if (next.assignment?.revoked && activeTurn(next)) {
				cancellation = { run: next, assignment: next.assignment };
			}
			return next;
		}, false);
		if (!live(updated) || updated.assignment?.revoked) {
			this.cancelCheck(updated.id);
		}
		if (cancellation) {
			await this.adapter.cancel(cancellation.run, cancellation.assignment);
		}
		if (live(updated)) {
			await this.continueRun(updated.id);
		}
		return this.requireRun(updated.id);
	}

	async prove(invocation: WorkflowInvocation, proof: WorkflowObject): Promise<WorkflowProofResult> {
		this.assertAlive();
		try {
			validateWorkflowObject(proof);
		} catch (error) {
			return { kind: 'rejected', reason: getErrorMessage(error) };
		}
		const existing = this.proofs.get(invocation.runId);
		if (existing && structuralEquals(existing.invocation, invocation)) {
			return structuralEquals(existing.proof, proof) ? existing.promise : {
				kind: 'rejected',
				reason: localize('workflow.proofInProgress', "Verification is already in progress for a different proof."),
			};
		}
		const operation: ProofOperation = { invocation: copy(invocation), proof: copy(proof), promise: this.doProve(copy(invocation), copy(proof)) };
		this.proofs.set(invocation.runId, operation);
		try {
			const result = await operation.promise;
			const run = await this.readRun(invocation.runId);
			if (run && live(run) && !activeTurn(run)) {
				await this.continueRun(run.id);
			}
			return result;
		} catch (error) {
			if (error instanceof WorkflowMissingRunError) {
				return staleAssignment();
			}
			throw error;
		} finally {
			if (this.proofs.get(invocation.runId) === operation) {
				this.proofs.delete(invocation.runId);
			}
		}
	}

	async reportBlocked(invocation: WorkflowInvocation, reason: string): Promise<WorkflowProofResult> {
		validateWorkflowValue(reason, { type: 'string', minLength: 1, maxLength: 4096 });
		const result = await this.mutate(invocation.runId, async run => {
			if (!this.currentInvocation(run, invocation)) {
				return staleAssignment();
			}
			await this.save(run, { status: 'blocked', reason, pendingAssignment: undefined, wait: undefined, verification: undefined, nextWakeAt: undefined });
			return { kind: 'blocked', reason } as const;
		});
		if (result.kind === 'blocked') {
			this.cancelCheck(invocation.runId);
		}
		return result;
	}

	async onTurnEnd(invocation: WorkflowInvocation, outcome: WorkflowTurnOutcome): Promise<void> {
		if (!['completed', 'cancelled', 'error'].includes(outcome)) {
			throw new Error(localize('workflow.invalidTurnOutcome', "Unsupported workflow turn outcome."));
		}
		const existing = await this.readRun(invocation.runId);
		if (!existing) {
			return;
		}
		const updated = await this.mutate(invocation.runId, async run => {
			if (invocationMatches(run.assignment, invocation) && run.assignment?.delivery !== 'ended') {
				return this.endTurn(run, outcome);
			}
			return run;
		});
		if (!live(updated)) {
			this.cancelCheck(updated.id);
		}
		await this.continueRun(invocation.runId);
	}

	wakeDue(): Promise<void> {
		this.assertAlive();
		if (!this.waking) {
			this.waking = this.doWake().finally(() => { this.waking = undefined; });
		}
		return this.waking;
	}

	recover(): Promise<void> {
		return this.wakeDue();
	}

	private async doWake(): Promise<void> {
		const runs = await this.store.listDueRuns(this.now(), this.wakeBatchSize);
		const results = await Promise.allSettled(runs.map(run => this.drive(run.id)));
		const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
		if (errors.length) {
			throw new AggregateError(errors, localize('workflow.wakeFailed', "Some workflows could not be recovered or checked."));
		}
	}

	private async doProve(invocation: WorkflowInvocation, proof: WorkflowObject): Promise<WorkflowProofResult> {
		const prepared = await this.mutate<WorkflowProofResult | VerificationRequest>(invocation.runId, async run => {
			const receipt = run.receipts.find(receipt => receipt.assignmentId === invocation.assignmentId);
			if (receipt) {
				if (receipt.turnId !== invocation.turnId) {
					return staleAssignment();
				}
				return structuralEquals(receipt.proof, proof)
					? { kind: 'accepted', receipt }
					: { kind: 'rejected', reason: localize('workflow.receiptImmutable', "This assignment already has a receipt for a different proof.") };
			}
			if (!run.assignment?.revoked && run.lastProof && structuralEquals(run.lastProof.invocation, invocation) && structuralEquals(run.lastProof.proof, proof)) {
				return run.lastProof.result;
			}
			if (!this.currentInvocation(run, invocation)) {
				if (run.wait?.kind === 'completion' && !run.assignment?.revoked && live(run) && invocationMatches(run.assignment, invocation) && structuralEquals(run.wait.proof, proof)) {
					return { kind: 'waiting', reason: run.wait.reason };
				}
				return staleAssignment();
			}
			const checkpoint = run.snapshot.checkpoints[run.checkpointIndex];
			try {
				validateWorkflowObject(proof, checkpoint.type.proofSchema);
			} catch (error) {
				return { kind: 'rejected', reason: getErrorMessage(error) };
			}
			if (run.wait?.kind === 'completion') {
				return structuralEquals(run.wait.proof, proof)
					? { kind: 'waiting', reason: run.wait.reason }
					: { kind: 'rejected', reason: localize('workflow.waitingProof', "A proof is already waiting for a durable check. End this turn and let the host check it.") };
			}
			if (checkpoint.type.completion.kind === 'reported') {
				const evidence: WorkflowEvidence[] = typeof proof.uri === 'string' && checkpoint.type.proofSchema.properties?.uri?.format === 'uri'
					? [{ kind: 'link', uri: proof.uri, label: checkpoint.label }] : [];
				const accepted = await this.accept(run, invocation, proof, proof, evidence, 'reported');
				return { kind: 'accepted', receipt: accepted };
			}
			return this.beginVerification(run, checkpoint.type.completion.check, 'completion', invocation, proof);
		});
		if (hasKey(prepared, { kind: true })) {
			return prepared;
		}
		return this.verifyCompletion(prepared);
	}

	private currentInvocation(run: WorkflowRun, invocation: WorkflowInvocation, allowEnded = false): boolean {
		return invocation.runId === run.id && live(run) && invocationMatches(run.assignment, invocation)
			&& (!run.assignment?.revoked || allowEnded && run.wait?.kind === 'completion')
			&& run.assignment?.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id
			&& (activeTurn(run) || allowEnded && run.assignment?.delivery === 'ended');
	}

	private unfinishedAssignment(run: WorkflowRun): boolean {
		return !!run.assignment && run.assignment.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id;
	}

	private withinBoundary(run: WorkflowRun): boolean {
		return run.checkpointIndex < run.snapshot.checkpoints.length
			&& run.checkpointIndex <= run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === run.stopAfter);
	}

	private newAssignment(run: WorkflowRun, reason: WorkflowAssignmentReason, previous?: WorkflowAssignment, diagnostics?: string): WorkflowAssignment {
		const checkpoint = run.snapshot.checkpoints[run.checkpointIndex];
		const inputs = resolveWorkflowBindings(checkpoint.inputs, run.inputs, run.receipts);
		validateWorkflowObject(inputs, checkpoint.type.inputSchema);
		return {
			id: this.generateId(),
			checkpointId: checkpoint.id,
			turnId: this.generateId(),
			attempt: previous ? previous.attempt + 1 : 1,
			reason,
			inputs,
			createdAt: this.now(),
			delivery: 'pending',
			diagnostics: diagnostics ?? (reason === 'resume' ? localize('workflow.resumeReconcile', "Reconcile the previous attempt's work and external effects. Reuse existing resources; do not repeat an external action whose outcome is uncertain.") : undefined),
			missingProofReminders: (previous?.missingProofReminders ?? 0) + (reason === 'missing_proof' ? 1 : 0),
			repairAttempts: previous?.repairAttempts ?? 0,
		};
	}

	private prepareAssignment(run: WorkflowRun, reason: WorkflowAssignmentReason, previous?: WorkflowAssignment): Partial<WorkflowRun> {
		const keys = getMissingWorkflowInputs(run);
		if (keys.length) {
			return {
				status: 'blocked',
				inputRequest: { checkpointId: run.snapshot.checkpoints[run.checkpointIndex].id, keys },
				pendingAssignment: undefined,
				wait: undefined,
				verification: undefined,
				nextWakeAt: undefined,
				reason: localize('workflow.needsInputs', "Provide {0} in the checkpoint list to continue.", keys.map(key => run.snapshot.inputSchema?.properties?.[key]?.title ?? key).join(', ')),
			};
		}
		return { pendingAssignment: this.newAssignment(run, reason, previous), inputRequest: undefined };
	}

	private async accept(run: WorkflowRun, invocation: WorkflowInvocation, proof: WorkflowObject, output: WorkflowObject, evidence: readonly WorkflowEvidence[], provenance: WorkflowReceipt['provenance'], checkId?: string): Promise<WorkflowReceipt> {
		const checkpoint = run.snapshot.checkpoints[run.checkpointIndex];
		validateWorkflowObject(output, checkpoint.type.outputSchema ?? (provenance === 'reported' ? checkpoint.type.proofSchema : undefined));
		const receipt: WorkflowReceipt = {
			id: this.generateId(), checkpointId: checkpoint.id, assignmentId: invocation.assignmentId, turnId: invocation.turnId,
			proof, output, evidence, provenance, acceptedAt: this.now(), checkId,
		};
		const progressed: WorkflowRun = {
			...run,
			checkpointIndex: run.checkpointIndex + 1,
			receipts: [...run.receipts, receipt],
			firstTurns: { ...run.firstTurns, [checkpoint.id]: run.firstTurns[checkpoint.id] ?? invocation.turnId },
			wait: undefined,
			verification: undefined,
			lastProof: undefined,
			reason: undefined,
		};
		const continues = this.withinBoundary(progressed);
		await this.save(run, {
			...progressed,
			status: progressed.checkpointIndex === run.snapshot.checkpoints.length ? 'completed' : continues ? 'running' : 'stopped',
			nextWakeAt: continues ? activeTurn(run) ? this.now() + this.reconcileIntervalMs : this.now() : undefined,
			...(continues ? this.prepareAssignment(progressed, 'previous_completed') : { pendingAssignment: undefined }),
		});
		return copy(receipt);
	}

	private async beginVerification(run: WorkflowRun, check: WorkflowCheckDefinition, kind: WorkflowVerification['kind'], invocation?: WorkflowInvocation, proof?: WorkflowObject): Promise<VerificationRequest> {
		const checkpoint = run.snapshot.checkpoints[run.checkpointIndex];
		const verification: WorkflowVerification = { id: this.generateId(), kind, checkpointId: checkpoint.id, invocation, proof };
		const nextCheckAt = this.now() + this.checkLeaseMs;
		const updated = await this.save(run, {
			status: 'waiting',
			verification,
			wait: {
				kind, checkpointId: checkpoint.id, reason: localize('workflow.verifying', "Checking workflow conditions."),
				nextCheckAt, state: run.wait?.state, proof, assignmentId: invocation?.assignmentId, turnId: invocation?.turnId,
			},
			nextWakeAt: nextCheckAt,
		});
		return { run: updated, checkpoint, check, verification, previousState: run.wait?.state };
	}

	private async evaluate(request: VerificationRequest): Promise<WorkflowCheckResult | undefined> {
		const source = new CancellationTokenSource();
		this.checkTokens.set(request.run.id, source);
		try {
			const current = await this.readRun(request.run.id);
			if (!current || !live(current) || current.verification?.id !== request.verification.id || source.token.isCancellationRequested) {
				return undefined;
			}
			const check = this.checks.get(request.check.check);
			if (!check) {
				return { kind: 'blocked', reason: localize('workflow.missingCheck', "Required workflow check '{0}' is unavailable.", request.check.check) };
			}
			const checkpointInputs = resolveWorkflowBindings(request.checkpoint.inputs, request.run.inputs, request.run.receipts);
			const result = await raceCancellation(check.evaluate({
				run: request.run,
				checkpoint: request.checkpoint,
				inputs: request.check.inputs ? resolveWorkflowBindings(request.check.inputs, checkpointInputs, request.run.receipts) : checkpointInputs,
				options: request.check.options ?? {},
				proof: request.verification.proof,
				previousState: request.previousState,
			}, source.token), source.token);
			if (source.token.isCancellationRequested) {
				return undefined;
			}
			if (!result) {
				throw new WorkflowValidationError('$check', localize('workflow.missingCheckResult', "A workflow check must return an explicit result."));
			}
			this.validateCheckResult(result);
			return result;
		} catch (error) {
			return { kind: 'blocked', reason: localize('workflow.checkError', "Workflow check failed: {0}", getErrorMessage(error).slice(0, 3800)) };
		} finally {
			if (this.checkTokens.get(request.run.id) === source) {
				this.checkTokens.deleteAndDispose(request.run.id);
			}
		}
	}

	private validateCheckResult(result: WorkflowCheckResult): void {
		switch (result.kind) {
			case 'satisfied':
				validateWorkflowObject(result.output);
				validateWorkflowEvidence(result.evidence ?? []);
				break;
			case 'waiting':
				validateWorkflowValue(result.retryAfterMs, { type: 'integer', minimum: 0 });
				if (result.state !== undefined) {
					validateWorkflowObject(result.state);
				}
				validateWorkflowValue(result.reason, { type: 'string', minLength: 1, maxLength: 4096 });
				break;
			case 'rejected':
			case 'blocked':
				validateWorkflowValue(result.reason, { type: 'string', minLength: 1, maxLength: 4096 });
				break;
			default:
				throw new WorkflowValidationError('$check.kind', localize('workflow.invalidCheckResult', "Unsupported workflow check result."));
		}
	}

	private async verifyCompletion(request: VerificationRequest): Promise<WorkflowProofResult> {
		const result = await this.evaluate(request);
		return this.mutate(request.run.id, async run => {
			const invocation = request.verification.invocation!;
			const proof = request.verification.proof!;
			if (!result || run.verification?.id !== request.verification.id || !this.currentInvocation(run, invocation, true)) {
				return staleAssignment();
			}
			if (result.kind === 'satisfied') {
				try {
					validateWorkflowObject(result.output, request.checkpoint.type.outputSchema);
				} catch (error) {
					return this.blockProof(run, invocation, proof, getErrorMessage(error));
				}
				const receipt = await this.accept(run, invocation, proof, result.output, result.evidence ?? [], 'checked', request.check.check);
				return { kind: 'accepted', receipt };
			}
			if (result.kind === 'waiting') {
				await this.saveWait(run, result);
				return { kind: 'waiting', reason: result.reason };
			}
			if (result.kind === 'blocked') {
				return this.blockProof(run, invocation, proof, result.reason);
			}
			const assignment = { ...run.assignment!, repairAttempts: (run.assignment!.repairAttempts ?? 0) + 1, diagnostics: result.reason };
			if (assignment.repairAttempts > this.maxRepairAttempts) {
				return this.blockProof(run, invocation, proof, localize('workflow.repairExhausted', "Workflow repair limit reached: {0}", result.reason));
			}
			const rejected: WorkflowProofResult = { kind: 'rejected', reason: result.reason };
			await this.save(run, {
				status: 'running', assignment, verification: undefined, wait: undefined, reason: result.reason,
				lastProof: { invocation, proof, result: rejected },
				pendingAssignment: assignment.delivery === 'ended' ? this.newAssignment(run, 'repair', assignment, result.reason) : undefined,
				nextWakeAt: assignment.delivery === 'ended' ? this.now() : this.now() + this.reconcileIntervalMs,
			});
			return rejected;
		});
	}

	private async blockProof(run: WorkflowRun, invocation: WorkflowInvocation, proof: WorkflowObject, reason: string): Promise<WorkflowProofResult> {
		reason = reason.slice(0, 4096);
		const result: WorkflowProofResult = { kind: 'blocked', reason };
		await this.save(run, {
			status: 'blocked', reason, verification: undefined, wait: undefined, pendingAssignment: undefined, nextWakeAt: undefined,
			lastProof: { invocation, proof, result },
		});
		return result;
	}

	private async saveWait(run: WorkflowRun, result: Extract<WorkflowCheckResult, { kind: 'waiting' }>): Promise<WorkflowRun> {
		const nextCheckAt = this.now() + Math.max(1000, Math.min(result.retryAfterMs, 86400000));
		return this.save(run, {
			status: 'waiting', verification: undefined, reason: result.reason,
			wait: { ...run.wait!, reason: result.reason, nextCheckAt, state: result.state },
			nextWakeAt: nextCheckAt,
		});
	}

	private async verifyStart(run: WorkflowRun): Promise<WorkflowRun | undefined> {
		const pendingId = run.pendingAssignment!.id;
		const request = await this.mutate(run.id, async current => {
			if (!live(current) || current.pendingAssignment?.id !== pendingId || activeTurn(current) || current.wait && current.wait.nextCheckAt > this.now()) {
				return undefined;
			}
			return this.beginVerification(current, current.snapshot.checkpoints[current.checkpointIndex].type.startCondition!, 'startCondition');
		});
		if (!request) {
			return undefined;
		}
		const result = await this.evaluate(request);
		const observedAt = this.now();
		return this.mutate(run.id, async current => {
			if (!result || !live(current) || current.verification?.id !== request.verification.id || current.pendingAssignment?.id !== pendingId) {
				return undefined;
			}
			if (result.kind === 'satisfied') {
				const receipt: WorkflowStartConditionReceipt = {
					id: this.generateId(),
					checkpointId: request.checkpoint.id,
					assignmentId: pendingId,
					checkId: request.check.check,
					output: result.output,
					evidence: result.evidence ?? [],
					provenance: 'checked',
					observedAt,
				};
				return this.save(current, {
					status: 'running', wait: undefined, verification: undefined, reason: undefined, nextWakeAt: this.now(),
					startConditionReceipts: [...(current.startConditionReceipts ?? []).filter(previous => previous.checkpointId !== receipt.checkpointId), receipt],
				});
			}
			if (result.kind === 'waiting') {
				await this.saveWait(current, result);
			} else {
				await this.save(current, { status: 'blocked', reason: result.reason, wait: undefined, verification: undefined, pendingAssignment: undefined, nextWakeAt: undefined });
			}
			return undefined;
		});
	}

	private drive(runId: string): Promise<void> {
		const existing = this.workers.get(runId);
		if (existing) {
			return existing;
		}
		const work = (async () => {
			do {
				this.redrive.delete(runId);
				try {
					await this.doDrive(runId);
				} catch (error) {
					if (!(error instanceof WorkflowMissingRunError)) {
						throw error;
					}
				}
			} while (this.redrive.delete(runId) && !this._store.isDisposed);
		})();
		this.workers.set(runId, work);
		void work.finally(() => {
			if (this.workers.get(runId) === work) {
				this.workers.delete(runId);
			}
		}).catch(() => { /* The caller receives the original rejection. */ });
		return work;
	}

	private async continueRun(runId: string): Promise<void> {
		if (this.workers.has(runId)) {
			this.redrive.add(runId);
		} else {
			await this.drive(runId);
		}
	}

	private async doDrive(runId: string): Promise<void> {
		let run = await this.readRun(runId);
		if (!run || !live(run) || this.checkTokens.has(runId)) {
			return;
		}
		if (activeTurn(run)) {
			run = await this.reconcile(run);
			if (!run || !live(run) || activeTurn(run)) {
				return;
			}
		}
		if (run.wait) {
			if (run.wait.nextCheckAt > this.now()) {
				return;
			}
			if (run.wait.kind === 'completion') {
				const request = await this.mutate(runId, async current => {
					if (!live(current) || current.wait?.kind !== 'completion' || current.wait.nextCheckAt > this.now()) {
						return undefined;
					}
					const rule = current.snapshot.checkpoints[current.checkpointIndex].type.completion;
					if (rule.kind !== 'checked') {
						throw new WorkflowValidationError('$run.wait', localize('workflow.reportedWait', "A reported checkpoint cannot have a completion check wait."));
					}
					return this.beginVerification(current, rule.check, 'completion', {
						runId, assignmentId: current.wait.assignmentId!, turnId: current.wait.turnId!,
					}, current.wait.proof);
				});
				if (!request) {
					return;
				}
				await this.verifyCompletion(request);
				run = await this.readRun(runId);
			}
		}
		if (!run || !live(run) || !run.pendingAssignment || !this.withinBoundary(run) || run.wait?.kind === 'completion') {
			return;
		}
		if (run.snapshot.checkpoints[run.checkpointIndex].type.startCondition) {
			run = await this.verifyStart(run);
			if (!run) {
				return;
			}
		}
		await this.dispatch(run);
	}

	private async reconcile(run: WorkflowRun): Promise<WorkflowRun | undefined> {
		const assignment = run.assignment!;
		const claimed = await this.mutate(run.id, async current => {
			if (!live(current) || current.assignment?.id !== assignment.id || !activeTurn(current)
				|| current.revision !== run.revision && current.nextWakeAt !== undefined && current.nextWakeAt > this.now()) {
				return undefined;
			}
			return this.save(current, { nextWakeAt: this.now() + this.reconcileIntervalMs });
		});
		if (!claimed) {
			return undefined;
		}
		const outcome = await this.adapter.reconcile(claimed, assignment);
		return this.mutate(run.id, async current => {
			if (!live(current) || current.assignment?.id !== assignment.id || !activeTurn(current)) {
				return current;
			}
			switch (outcome) {
				case 'running':
					return this.save(current, {
						assignment: { ...current.assignment, delivery: 'running' },
						firstTurns: { ...current.firstTurns, [assignment.checkpointId]: current.firstTurns[assignment.checkpointId] ?? assignment.turnId },
					});
				case 'ended':
					return this.endTurn(current, 'completed');
				case 'notStarted': {
					if (current.receipts.some(receipt => receipt.assignmentId === assignment.id) || current.wait?.kind === 'completion') {
						return this.blockUncertain(current);
					}
					const pendingAssignment = assignment.revoked
						? this.newAssignment(current, 'resume', assignment)
						: { ...current.assignment, delivery: 'pending' as const };
					return this.save(current, { assignment: undefined, pendingAssignment, nextWakeAt: this.now() });
				}
				case 'unknown':
					return this.blockUncertain(current);
				default:
					throw new Error(localize('workflow.invalidReconciliation', "Unsupported workflow reconciliation result."));
			}
		});
	}

	private blockUncertain(run: WorkflowRun): Promise<WorkflowRun> {
		return this.save(run, {
			status: 'blocked',
			reason: localize('workflow.uncertainEffects', "The previous turn's outcome is unknown. Reconcile its existing work and external effects before resuming; it will not be replayed automatically."),
			pendingAssignment: undefined, verification: undefined, nextWakeAt: undefined,
		});
	}

	private async endTurn(run: WorkflowRun, outcome: WorkflowTurnOutcome): Promise<WorkflowRun> {
		const assignment = { ...run.assignment!, delivery: 'ended' as const };
		const state: WorkflowRun = {
			...run, assignment,
			firstTurns: { ...run.firstTurns, [assignment.checkpointId]: run.firstTurns[assignment.checkpointId] ?? assignment.turnId },
		};
		if (!live(run)) {
			return this.save(run, state);
		}
		if (outcome !== 'completed' && !assignment.revoked) {
			return this.save(run, {
				...state, status: 'blocked',
				reason: localize('workflow.turnInterrupted', "The workflow turn was interrupted ({0}). Reconcile its work before resuming.", outcome),
				pendingAssignment: undefined, wait: undefined, verification: undefined, nextWakeAt: undefined,
			});
		}
		if (run.receipts.some(receipt => receipt.assignmentId === assignment.id)) {
			return this.save(run, { ...state, nextWakeAt: this.now() });
		}
		if (run.wait?.kind === 'completion') {
			return this.save(run, state);
		}
		if (assignment.revoked && this.withinBoundary(state)) {
			return this.save(run, { ...state, pendingAssignment: this.newAssignment(state, 'resume', assignment), nextWakeAt: this.now() });
		}
		if (run.lastProof?.result.kind === 'rejected') {
			return this.save(run, { ...state, pendingAssignment: this.newAssignment(state, 'repair', assignment, run.lastProof.result.reason), nextWakeAt: this.now() });
		}
		if ((assignment.missingProofReminders ?? 0) < this.maxMissingProofReminders) {
			return this.save(run, {
				...state,
				pendingAssignment: this.newAssignment(state, 'missing_proof', assignment, localize('workflow.missingProof', "The previous turn ended without proof. Reconcile the work already performed; do not repeat external actions. Submit proof or report a blocker.")),
				nextWakeAt: this.now(),
			});
		}
		return this.save(run, {
			...state, status: 'blocked', pendingAssignment: undefined, nextWakeAt: undefined,
			reason: localize('workflow.missingProofLimit', "The workflow turn repeatedly ended without proof. Review its existing work before resuming."),
		});
	}

	private isStartConditionObservationFresh(run: WorkflowRun, assignment: WorkflowAssignment): boolean {
		const condition = run.snapshot.checkpoints[run.checkpointIndex].type.startCondition;
		if (!condition) {
			return true;
		}
		const observation = run.startConditionReceipts?.find(receipt =>
			receipt.checkpointId === assignment.checkpointId && receipt.assignmentId === assignment.id && receipt.checkId === condition.check);
		const age = observation && this.now() - observation.observedAt;
		return age !== undefined && age >= 0 && age < this.startConditionMaxAgeMs;
	}

	private async dispatch(run: WorkflowRun): Promise<void> {
		const pending = run.pendingAssignment!;
		const readiness = await this.adapter.canDispatch(run);
		if (readiness.kind === 'ready' && !this.isStartConditionObservationFresh(run, pending)) {
			const verified = await this.verifyStart(run);
			if (!verified) {
				return;
			}
		}
		const dispatched = await this.mutate(run.id, async current => {
			if (!live(current) || current.pendingAssignment?.id !== pending.id || activeTurn(current) || !this.withinBoundary(current) || current.wait || current.verification) {
				return undefined;
			}
			if (readiness.kind === 'blocked') {
				await this.save(current, { status: 'blocked', reason: readiness.reason, pendingAssignment: undefined, nextWakeAt: undefined });
				return undefined;
			}
			if (readiness.kind === 'busy') {
				await this.save(current, { nextWakeAt: this.now() + this.dispatchRetryMs });
				return undefined;
			}
			if (readiness.kind !== 'ready') {
				throw new Error(localize('workflow.invalidReadiness', "Unsupported workflow dispatch readiness."));
			}
			if (!this.isStartConditionObservationFresh(current, current.pendingAssignment)) {
				await this.save(current, { nextWakeAt: this.now() + this.dispatchRetryMs });
				return undefined;
			}
			return this.save(current, {
				assignment: { ...current.pendingAssignment, delivery: 'dispatching' }, pendingAssignment: undefined,
				status: 'running', wait: undefined, verification: undefined, lastProof: undefined, reason: undefined, nextWakeAt: this.now(),
			});
		});
		if (!dispatched?.assignment) {
			return;
		}
		const assignment = dispatched.assignment;
		const latest = await this.readRun(run.id);
		if (!latest || !this.currentInvocation(latest, { runId: run.id, assignmentId: assignment.id, turnId: assignment.turnId })) {
			return;
		}
		try {
			await this.adapter.dispatch(latest, assignment, this.renderAssignment(latest, assignment));
		} catch (error) {
			await this.mutate(run.id, async current => {
				if (live(current) && current.assignment?.id === assignment.id && activeTurn(current)) {
					if (error instanceof WorkflowDispatchBusyError && current.assignment.delivery === 'dispatching'
						&& !current.assignment.revoked && !current.wait && !current.receipts.some(receipt => receipt.assignmentId === assignment.id)) {
						await this.save(current, {
							assignment: undefined,
							pendingAssignment: { ...current.assignment, delivery: 'pending' },
							nextWakeAt: this.now() + this.dispatchRetryMs,
						});
						return;
					}
					await this.save(current, {
						status: 'blocked', pendingAssignment: undefined, nextWakeAt: undefined,
						reason: localize('workflow.dispatchFailed', "Workflow dispatch could not be confirmed. Reconcile before resuming: {0}", getErrorMessage(error).slice(0, 3800)),
					});
				}
			});
			return;
		}
		const acknowledged = await this.mutate(run.id, async current => {
			if (current.assignment?.id !== assignment.id || current.assignment.delivery !== 'dispatching') {
				return current;
			}
			return this.save(current, {
				assignment: { ...current.assignment, delivery: 'running' },
				firstTurns: { ...current.firstTurns, [assignment.checkpointId]: current.firstTurns[assignment.checkpointId] ?? assignment.turnId },
				nextWakeAt: live(current) ? current.wait?.nextCheckAt ?? this.now() + this.reconcileIntervalMs : undefined,
			});
		});
		if (acknowledged.assignment?.id === assignment.id && acknowledged.assignment.revoked && activeTurn(acknowledged)) {
			await this.adapter.cancel(acknowledged, acknowledged.assignment);
		}
	}

	private renderAssignment(run: WorkflowRun, assignment: WorkflowAssignment): string {
		const checkpoint = run.snapshot.checkpoints.find(checkpoint => checkpoint.id === assignment.checkpointId)!;
		return buildWorkflowPrompt(checkpoint.instructions, checkpoint.type.proofSchema, assignment.inputs, assignment.diagnostics);
	}

	private async readRun(id: string): Promise<WorkflowRun | undefined> {
		this.assertAlive();
		const run = await this.store.getRun(id);
		if (run !== undefined) {
			validateWorkflowRun(run);
			return copy(run);
		}
		return undefined;
	}

	private async requireRun(id: string): Promise<WorkflowRun> {
		const run = await this.readRun(id);
		if (!run) {
			throw new WorkflowMissingRunError(id);
		}
		return run;
	}

	private async save(run: WorkflowRun, changes: Partial<WorkflowRun>): Promise<WorkflowRun> {
		this.assertAlive();
		const updated = copy({ ...run, ...changes, revision: run.revision + 1, updatedAt: this.now() });
		validateWorkflowRun(updated);
		if (!await this.store.updateRun(updated, run.revision)) {
			throw new WorkflowConflictError(run.id);
		}
		this.changeEmitter.fire(updated);
		return updated;
	}

	private mutate<T>(id: string, update: (run: WorkflowRun) => Promise<T>, retry = true): Promise<T> {
		return this.serialize(`run:${id}`, async () => {
			for (let attempt = 0; ; attempt++) {
				try {
					return await update(await this.requireRun(id));
				} catch (error) {
					if (!retry || !(error instanceof WorkflowConflictError) || attempt >= 2) {
						throw error;
					}
				}
			}
		});
	}

	private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
		this.assertAlive();
		const previous = this.mutations.get(key) ?? Promise.resolve();
		const result = previous.then(() => {
			this.assertAlive();
			return operation();
		});
		const settled = result.then(() => { }, () => { });
		this.mutations.set(key, settled);
		try {
			return await result;
		} finally {
			if (this.mutations.get(key) === settled) {
				this.mutations.delete(key);
			}
		}
	}

	private cancelCheck(runId: string): void {
		this.checkTokens.get(runId)?.cancel();
		this.checkTokens.deleteAndDispose(runId);
	}

	private assertAlive(): void {
		if (this._store.isDisposed) {
			throw new Error(localize('workflow.runnerDisposed', "The workflow runner has been disposed."));
		}
	}

	override dispose(): void {
		for (const token of this.checkTokens.values()) {
			token.cancel();
		}
		this.redrive.clear();
		super.dispose();
	}
}
