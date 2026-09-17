/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IWorkflowExecutionAdapter, IWorkflowStore, WorkflowAssignment, WorkflowCheckpointType, WorkflowDispatchReadiness, WorkflowRun, WorkflowSnapshot } from '../../common/workflow.js';
import { getWorkflowCheckpointTypeReference, resolveWorkflowDefinition } from '../../common/workflowValidation.js';

export const proofSchema: IJSONSchema = {
	type: 'object',
	properties: { summary: { type: 'string', minLength: 1 } },
	required: ['summary'],
	additionalProperties: false,
};

export function makeType(id: string, overrides: Partial<WorkflowCheckpointType> = {}): WorkflowCheckpointType {
	return {
		id, version: 1, label: id, instructions: `Complete ${id}.`,
		proofSchema, completion: { kind: 'reported' },
		...overrides,
	};
}

export function makeSnapshot(types: readonly WorkflowCheckpointType[] = [makeType('first'), makeType('second'), makeType('third')]): WorkflowSnapshot {
	return resolveWorkflowDefinition({
		id: 'test.workflow', version: 1, label: 'Test workflow',
		checkpoints: types.map(type => ({ id: type.id, type: getWorkflowCheckpointTypeReference(type) })),
	}, types);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export class TestWorkflowStore implements IWorkflowStore {
	readonly runs = new Map<string, WorkflowRun>();
	readonly dueIndex = new Map<string, number>();
	readonly updates: WorkflowRun[] = [];
	readonly readIds: string[] = [];
	dueQueries = 0;
	writeAttempts = 0;
	conflicts = 0;
	failWrites = false;
	failCreate = false;
	failReads = false;
	failWriteAt = -1;
	afterUpdate?: (run: WorkflowRun) => void;

	async getRun(id: string): Promise<WorkflowRun | undefined> {
		if (this.failReads) {
			throw new Error('Store is unavailable');
		}
		this.readIds.push(id);
		const run = this.runs.get(id);
		return run && clone(run);
	}

	async getSessionRun(session: string): Promise<WorkflowRun | undefined> {
		if (this.failReads) {
			throw new Error('Store is unavailable');
		}
		const run = [...this.runs.values()].find(run => run.session === session);
		return run && clone(run);
	}

	async listRuns(): Promise<readonly WorkflowRun[]> {
		throw new Error('Full workflow enumeration must not be used by the runner');
	}

	async listDueRuns(now: number, limit: number): Promise<readonly WorkflowRun[]> {
		if (this.failReads) {
			throw new Error('Store is unavailable');
		}
		this.dueQueries++;
		return [...this.dueIndex].filter(([, time]) => time <= now).sort((a, b) => a[1] - b[1]).slice(0, limit)
			.map(([id]) => clone(this.runs.get(id)!));
	}

	async createRun(run: WorkflowRun): Promise<void> {
		if (this.failCreate) {
			throw new Error('Create transaction failed');
		}
		if (this.runs.has(run.id) || [...this.runs.values()].some(existing => existing.session === run.session)) {
			throw new Error('Run or session already exists');
		}
		this.seed(run);
	}

	async updateRun(run: WorkflowRun, expectedRevision: number): Promise<boolean> {
		this.writeAttempts++;
		if (this.failWrites || this.writeAttempts === this.failWriteAt) {
			throw new Error('Write transaction failed');
		}
		if (this.conflicts > 0) {
			this.conflicts--;
			return false;
		}
		if (this.runs.get(run.id)?.revision !== expectedRevision) {
			return false;
		}
		this.seed(run);
		this.updates.push(clone(run));
		this.afterUpdate?.(run);
		return true;
	}

	async deleteSession(session: string): Promise<void> {
		for (const [id, run] of this.runs) {
			if (run.session === session) {
				this.runs.delete(id);
				this.dueIndex.delete(id);
			}
		}
	}

	seed(run: WorkflowRun): void {
		this.runs.set(run.id, clone(run));
		if (run.nextWakeAt === undefined) {
			this.dueIndex.delete(run.id);
		} else {
			this.dueIndex.set(run.id, run.nextWakeAt);
		}
	}
}

export class TestWorkflowAdapter implements IWorkflowExecutionAdapter {
	readonly dispatches: { run: WorkflowRun; assignment: WorkflowAssignment; message: string }[] = [];
	readonly cancellations: WorkflowAssignment[] = [];
	reconciliations = 0;
	readiness: WorkflowDispatchReadiness = { kind: 'ready' };
	reconcileResult: 'running' | 'ended' | 'notStarted' | 'unknown' = 'running';
	onDispatch?: (run: WorkflowRun, assignment: WorkflowAssignment) => Promise<void>;
	onCanDispatch?: () => Promise<WorkflowDispatchReadiness>;

	async canDispatch(): Promise<WorkflowDispatchReadiness> {
		return this.onCanDispatch ? this.onCanDispatch() : this.readiness;
	}

	async dispatch(run: WorkflowRun, assignment: WorkflowAssignment, message: string): Promise<void> {
		this.dispatches.push({ run, assignment, message });
		await this.onDispatch?.(run, assignment);
	}

	async cancel(_run: WorkflowRun, assignment: WorkflowAssignment): Promise<void> {
		this.cancellations.push(assignment);
	}

	async reconcile(): Promise<'running' | 'ended' | 'notStarted' | 'unknown'> {
		this.reconciliations++;
		return this.reconcileResult;
	}
}
