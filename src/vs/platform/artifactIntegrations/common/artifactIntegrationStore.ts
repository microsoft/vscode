/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { deepClone } from '../../../base/common/objects.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactJsonValue, ArtifactRecord, ArtifactRun, artifactBindingId, isArtifactOptionEnabled, isArtifactRunSettled } from './artifactIntegration.js';
import { isArtifactAutomationOption, isArtifactConfiguration, isArtifactJsonValue, isArtifactRecord, isArtifactRun, isCounter, isDictionary, isRecord } from './artifactIntegrationValidation.js';
import { ArtifactStorageCommitError, IArtifactIntegrationStorage } from './artifactRuntime.js';

const settledRunRetentionPerBinding = 200;

export interface ArtifactStoredBinding {
	readonly id: string;
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly integrationId: string;
	readonly runtimeId: string;
	readonly credentialScope: string;
	readonly resourceKey: string;
	readonly options: readonly ArtifactAutomationOption[];
	readonly consent: Readonly<Record<string, string>>;
	readonly configuration: ArtifactAutomationConfiguration;
	readonly checkpoint: { readonly revision: number; readonly value?: ArtifactJsonValue };
}

export interface ArtifactIntegrationState {
	readonly version: 1;
	readonly authority: string;
	revision: number;
	bindings: ArtifactStoredBinding[];
	runs: ArtifactRun[];
}

export class ArtifactConfigurationConflictError extends Error {
	constructor() {
		super(localize('artifactConfigurationConflict', "The artifact configuration changed. Refresh it and try again."));
	}
}

export class ArtifactRetryLimitError extends Error {
	constructor(readonly optionId: string, readonly lastRunId: string) {
		super(localize('artifactRetryLimit', "This automation was turned off because its attempt limit was reached. Review its runs before enabling it again."));
	}
}

function isBinding(value: unknown): value is ArtifactStoredBinding {
	return isRecord(value) && typeof value.id === 'string' && typeof value.session === 'string' && isArtifactRecord(value.artifact)
		&& typeof value.integrationId === 'string' && typeof value.runtimeId === 'string' && typeof value.credentialScope === 'string' && typeof value.resourceKey === 'string'
		&& Array.isArray(value.options) && value.options.every(isArtifactAutomationOption) && new Set(value.options.map(option => option.id)).size === value.options.length
		&& isDictionary(value.consent, (item): item is string => typeof item === 'string')
		&& isArtifactConfiguration(value.configuration) && isRecord(value.checkpoint) && isCounter(value.checkpoint.revision)
		&& (value.checkpoint.value === undefined || isArtifactJsonValue(value.checkpoint.value));
}

export function parseArtifactIntegrationState(raw: string, authority: string): ArtifactIntegrationState {
	const value: unknown = JSON.parse(raw);
	if (!isRecord(value) || value.version !== 1 || value.authority !== authority || !isCounter(value.revision)
		|| !Array.isArray(value.bindings) || !value.bindings.every(isBinding)
		|| !Array.isArray(value.runs)) {
		throw new Error('Invalid artifact integration ledger');
	}
	const bindings = value.bindings;
	// Runs persisted before they recorded their integration take it from their binding.
	const runs: unknown[] = value.runs.map(run => isRecord(run) && run.integrationId === undefined
		? { ...run, integrationId: bindings.find(binding => binding.id === run.bindingId)?.integrationId }
		: run);
	if (!runs.every(isArtifactRun)) {
		throw new Error('Invalid artifact integration ledger');
	}
	if (new Set(bindings.map(binding => binding.id)).size !== bindings.length || new Set(runs.map(run => run.id)).size !== runs.length
		|| bindings.some(binding => binding.id !== artifactBindingId(authority, binding.session, binding.artifact.id, binding.integrationId))
		|| runs.some(run => !bindings.some(binding => binding.id === run.bindingId && binding.integrationId === run.integrationId))) {
		throw new Error('Invalid artifact integration ledger identities');
	}
	return { version: 1, authority, revision: value.revision, bindings, runs };
}

function pruneSettledRuns(state: ArtifactIntegrationState): void {
	const retained = new Set(state.runs.filter(run => !isArtifactRunSettled(run) || run.indeterminate).map(run => run.id));
	for (const binding of state.bindings) {
		for (const run of state.runs.filter(run => run.bindingId === binding.id && isArtifactRunSettled(run)).slice(-settledRunRetentionPerBinding)) {
			retained.add(run.id);
		}
		for (const disablement of Object.values(binding.configuration.disablements)) {
			if (disablement.lastRunId) {
				retained.add(disablement.lastRunId);
			}
		}
		// Repeat protection and attempt budgets read every occurrence's latest and dispatched attempts in the
		// current consent generation, so those survive however much other history accumulates.
		const latestAttempts = new Map<string, ArtifactRun>();
		for (const run of state.runs) {
			const option = run.bindingId === binding.id && run.source === 'automation' ? binding.options.find(option => option.id === run.optionId) : undefined;
			if (!option || !isArtifactOptionEnabled(option, binding.configuration.values[option.id]) || binding.configuration.generations[option.id] !== run.generation) {
				continue;
			}
			if (run.dispatched) {
				retained.add(run.id);
			}
			latestAttempts.set(JSON.stringify([option.id, run.occurrenceKey]), run);
		}
		for (const run of latestAttempts.values()) {
			retained.add(run.id);
		}
	}
	let changed: boolean;
	do {
		changed = false;
		for (const run of state.runs) {
			if (retained.has(run.id) && run.retryOf && !retained.has(run.retryOf)) {
				retained.add(run.retryOf);
				changed = true;
			}
		}
	} while (changed);
	state.runs = state.runs.filter(run => retained.has(run.id));
}

export class ArtifactIntegrationStore {
	private readonly sequencer = new Sequencer();
	private readonly stateValue;
	readonly state: IObservable<ArtifactIntegrationState>;
	private initialized: Promise<void> | undefined;
	private writeFailure: Error | undefined;

	constructor(private readonly authority: string, private readonly storage: IArtifactIntegrationStorage, private readonly isOwner: () => boolean) {
		this.stateValue = observableValue<ArtifactIntegrationState>(this, { version: 1, authority, revision: 0, bindings: [], runs: [] });
		this.state = this.stateValue;
	}

	initialize(): Promise<void> {
		return this.initialized ??= this.load();
	}

	private async load(): Promise<void> {
		const raw = await this.storage.read();
		if (raw !== undefined) {
			this.stateValue.set(parseArtifactIntegrationState(raw, this.authority), undefined);
		}
	}

	transact<T>(change: (state: ArtifactIntegrationState) => T): Promise<T> {
		return this.sequencer.queue(async () => {
			await this.initialize();
			this.assertOwner();
			if (this.writeFailure) {
				throw this.writeFailure;
			}
			const current = this.stateValue.get();
			const next = deepClone(current);
			const result = change(next);
			pruneSettledRuns(next);
			// Idempotent requests, such as a repeated automation occurrence, must not write or notify observers that may repeat them.
			if (structuralEquals(next, current)) {
				return result;
			}
			next.revision++;
			try {
				await this.storage.write(JSON.stringify(next));
			} catch (error) {
				this.writeFailure = error instanceof Error ? error : new Error(String(error));
				if (error instanceof ArtifactStorageCommitError) {
					this.stateValue.set(next, undefined);
				}
				throw error;
			}
			this.stateValue.set(next, undefined);
			return result;
		});
	}

	assertOwner(): void {
		if (!this.isOwner()) {
			throw new Error(localize('artifactOwnershipLost', "This artifact integration runtime no longer owns execution."));
		}
	}

	whenIdle(): Promise<void> {
		return this.sequencer.queue(async () => { });
	}
}
