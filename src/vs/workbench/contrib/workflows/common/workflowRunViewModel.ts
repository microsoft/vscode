/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkflowControl, WorkflowObject, WorkflowRun } from '../../../../platform/workflow/common/workflow.js';
import { validateWorkflowInputs, validateWorkflowValue } from '../../../../platform/workflow/common/workflowValidation.js';
import { IWorkflowService } from './workflowService.js';

export class WorkflowRunViewModel extends Disposable {
	readonly run;
	readonly proposedStopAfter = observableValue<string | undefined>(this, undefined);
	readonly expandedCheckpoints = observableValue<ReadonlySet<string>>(this, new Set());
	readonly busy = observableValue(this, false);
	readonly error = observableValue<string | undefined>(this, undefined);
	readonly inputDrafts = observableValue<Readonly<Record<string, string>>>(this, {});

	constructor(
		readonly session: URI,
		run: WorkflowRun,
		@IWorkflowService private readonly workflowService: IWorkflowService,
	) {
		super();
		const runId = run.id;
		this.run = observableValue<WorkflowRun>(this, run);
		this._register(workflowService.onDidChangeRun(value => {
			if (value.id === runId && isEqual(URI.parse(value.session), session) && value.revision > this.run.get().revision) {
				transaction(tx => {
					if (value.stopAfter !== this.run.get().stopAfter) {
						this.proposedStopAfter.set(undefined, tx);
					}
					this.run.set(value, tx);
					const proposed = this.proposedStopAfter.get();
					const proposedIndex = value.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === proposed);
					if (proposed && (proposedIndex < this.minimumStopIndex || value.status === 'completed' || value.status === 'cancelled')) {
						this.proposedStopAfter.set(undefined, tx);
						this.error.set(localize('workflow.proposalPassed', "The workflow progressed beyond the proposed stopping point. Completed checkpoints are preserved; the proposal was cleared."), tx);
					}
				});
			}
		}));
		try {
			this._register(workflowService.watchSession(session));
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	get minimumStopIndex(): number {
		return Math.max(0, this.run.get().checkpointIndex - 1, this.run.get().receipts.length - 1);
	}

	get stopIndex(): number {
		const run = this.run.get();
		return run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === (this.proposedStopAfter.get() ?? run.stopAfter));
	}

	get canChangeStop(): boolean {
		return !this.busy.get() && this.run.get().status !== 'completed' && this.run.get().status !== 'cancelled';
	}

	get canContinue(): boolean {
		const run = this.run.get();
		return (run.status === 'paused' || run.status === 'blocked')
			&& (run.status === 'paused' || !run.inputRequest)
			&& run.checkpointIndex <= run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === run.stopAfter);
	}

	canProposeStop(checkpointId: string): boolean {
		const index = this.run.get().snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === checkpointId);
		return this.canChangeStop && index >= this.minimumStopIndex;
	}

	toggleCheckpoint(checkpointId: string): void {
		const expanded = new Set(this.expandedCheckpoints.get());
		if (!expanded.delete(checkpointId)) {
			expanded.add(checkpointId);
		}
		this.expandedCheckpoints.set(expanded, undefined);
	}

	proposeStop(checkpointId: string): void {
		if (!this.canProposeStop(checkpointId)) {
			this.error.set(localize('workflow.invalidStopProposal', "Choose a stopping point at or after the last completed checkpoint in an active workflow."), undefined);
			return;
		}
		transaction(tx => {
			this.proposedStopAfter.set(checkpointId === this.run.get().stopAfter ? undefined : checkpointId, tx);
			this.error.set(undefined, tx);
		});
	}

	cancelProposal(): void {
		this.proposedStopAfter.set(undefined, undefined);
	}

	async applyProposal(): Promise<void> {
		if (this.busy.get()) {
			return;
		}
		const checkpointId = this.proposedStopAfter.get();
		if (checkpointId) {
			if (!this.canProposeStop(checkpointId)) {
				this.proposeStop(checkpointId);
				return;
			}
			await this.control({ kind: 'setStopAfter', checkpointId, runId: this.run.get().id, revision: this.run.get().revision });
			if (!this._store.isDisposed && !this.error.get()) {
				this.cancelProposal();
			}
		}
	}

	async stopWorkflow(): Promise<void> {
		const run = this.run.get();
		await this.control({ kind: 'pause', runId: run.id, revision: run.revision });
	}

	async continueWorkflow(): Promise<void> {
		const run = this.run.get();
		await this.control({ kind: 'resume', runId: run.id, revision: run.revision });
	}

	setInputValue(key: string, value: string): void {
		this.inputDrafts.set({ ...this.inputDrafts.get(), [key]: value }, undefined);
	}

	async provideInputs(): Promise<void> {
		if (this.busy.get()) {
			return;
		}
		const run = this.run.get();
		if (!run.inputRequest || run.status !== 'blocked') {
			this.error.set(localize('workflow.inputsNotRequested', "This checkpoint is not waiting for inputs. Continue the stopped workflow before providing inputs."), undefined);
			return;
		}
		const inputs: Record<string, WorkflowObject[string]> = {};
		try {
			for (const key of run.inputRequest.keys) {
				const schema = run.snapshot.inputSchema?.properties?.[key];
				const text = this.inputDrafts.get()[key] ?? (schema?.type === 'string' ? '' : undefined);
				if (text === undefined) {
					throw new Error(localize('workflow.inputRequired', "Enter {0}.", schema?.title ?? key));
				}
				const value: unknown = schema?.type === 'string' ? text : JSON.parse(text);
				validateWorkflowValue(value, schema);
				inputs[key] = value;
			}
			validateWorkflowInputs({ ...run.inputs, ...inputs }, run.snapshot.inputSchema);
		} catch (error) {
			this.error.set(String(error), undefined);
			return;
		}
		await this.control({ kind: 'provideInputs', runId: run.id, revision: run.revision, inputs });
	}

	private async control(control: WorkflowControl): Promise<void> {
		if (this.busy.get()) {
			return;
		}
		transaction(tx => {
			this.busy.set(true, tx);
			this.error.set(undefined, tx);
		});
		try {
			const run = await this.workflowService.control(this.session, control);
			if (!this._store.isDisposed && run.revision > this.run.get().revision) {
				this.run.set(run, undefined);
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				this.error.set(String(error), undefined);
			}
		} finally {
			if (!this._store.isDisposed) {
				this.busy.set(false, undefined);
			}
		}
	}
}
