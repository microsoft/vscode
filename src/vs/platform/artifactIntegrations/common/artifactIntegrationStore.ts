/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { deepClone } from '../../../base/common/objects.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { ArtifactAction, ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactJsonValue, ArtifactRecord, ArtifactRun, artifactOptionDisabledValue } from './artifactIntegration.js';
import { IArtifactIntegrationStorage } from './artifactRuntime.js';

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

export function artifactBindingId(authority: string, session: string, artifactId: string, integrationId: string): string {
	return JSON.stringify([authority, session, artifactId, integrationId]);
}

export function artifactOptionConsent(option: ArtifactAutomationOption, actions: readonly ArtifactAction[]): string {
	return JSON.stringify([
		option.kind, artifactOptionDisabledValue(option), option.maxAttempts, option.consentVersion,
		option.kind === 'enum' ? option.choices.map(choice => choice.value).sort() : [],
		[...option.actionIds].sort().map(id => {
			const action = actions.find(action => action.id === id);
			return action ? artifactActionConsent(action) : undefined;
		}),
	]);
}

export function artifactActionConsent(action: ArtifactAction): string {
	return JSON.stringify([action.id, action.kind, action.kind === 'code' ? action.executionScope : undefined, action.consentVersion]);
}

export function emptyArtifactConfiguration(options: readonly ArtifactAutomationOption[]): ArtifactAutomationConfiguration {
	return {
		revision: 0,
		values: Object.fromEntries(options.map(option => [option.id, artifactOptionDisabledValue(option)])),
		generations: Object.fromEntries(options.map(option => [option.id, 0])),
		disablements: {},
	};
}

export function isArtifactJsonValue(value: unknown, depth = 0): value is ArtifactJsonValue {
	if (depth > 50) {
		return false;
	}
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return true;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every(item => isArtifactJsonValue(item, depth + 1));
	}
	return isRecord(value) && Object.entries(value).every(([key, item]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && isArtifactJsonValue(item, depth + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDictionary<T>(value: unknown, check: (item: unknown) => item is T): value is Record<string, T> {
	return isRecord(value) && Object.values(value).every(check);
}

export function isArtifactRecord(value: unknown): value is ArtifactRecord {
	return isRecord(value) && typeof value.id === 'string' && typeof value.resource === 'string' && typeof value.label === 'string'
		&& (value.origin === undefined || (isRecord(value.origin) && typeof value.origin.chat === 'string' && (value.origin.turnId === undefined || typeof value.origin.turnId === 'string')));
}

export function validateArtifactOptions(options: readonly ArtifactAutomationOption[]): void {
	const ids = new Set<string>();
	for (const option of options) {
		if (!isArtifactAutomationOption(option) || ids.has(option.id)) {
			throw new Error(`Invalid or duplicate artifact automation option: ${option.id}`);
		}
		ids.add(option.id);
	}
}

export function isArtifactAutomationOption(value: unknown): value is ArtifactAutomationOption {
	if (!isRecord(value) || typeof value.id !== 'string' || !/^[\w][\w.-]*$/.test(value.id)
		|| ['__proto__', 'constructor', 'prototype'].includes(value.id)
		|| typeof value.label !== 'string' || typeof value.description !== 'string'
		|| (value.consentVersion !== undefined && typeof value.consentVersion !== 'string')
		|| !Array.isArray(value.actionIds) || !value.actionIds.length || !value.actionIds.every(id => typeof id === 'string')
		|| new Set(value.actionIds).size !== value.actionIds.length
		|| !isCounter(value.maxAttempts) || value.maxAttempts === 0) {
		return false;
	}
	if (value.kind === 'boolean') {
		return value.defaultValue === false;
	}
	return value.kind === 'enum' && typeof value.disabledValue === 'string' && value.defaultValue === value.disabledValue
		&& Array.isArray(value.choices) && value.choices.length > 0
		&& value.choices.every(choice => isRecord(choice) && typeof choice.value === 'string' && typeof choice.label === 'string' && (choice.description === undefined || typeof choice.description === 'string'))
		&& value.choices.some(choice => choice.value === value.disabledValue)
		&& new Set(value.choices.map(choice => choice.value)).size === value.choices.length;
}

export function isArtifactConfiguration(value: unknown): value is ArtifactAutomationConfiguration {
	return isRecord(value) && isCounter(value.revision)
		&& isDictionary(value.values, (item): item is string | boolean => typeof item === 'string' || typeof item === 'boolean')
		&& isDictionary(value.generations, isCounter)
		&& isRecord(value.disablements) && Object.values(value.disablements).every(item =>
			isRecord(item) && typeof item.reason === 'string' && isCounter(item.attempts) && (item.lastRunId === undefined || typeof item.lastRunId === 'string'));
}

function isBinding(value: unknown): value is ArtifactStoredBinding {
	return isRecord(value) && typeof value.id === 'string' && typeof value.session === 'string' && isArtifactRecord(value.artifact)
		&& typeof value.integrationId === 'string' && typeof value.runtimeId === 'string' && typeof value.credentialScope === 'string' && typeof value.resourceKey === 'string'
		&& Array.isArray(value.options) && value.options.every(isArtifactAutomationOption) && new Set(value.options.map(option => option.id)).size === value.options.length
		&& isDictionary(value.consent, (item): item is string => typeof item === 'string')
		&& isArtifactConfiguration(value.configuration) && isRecord(value.checkpoint) && isCounter(value.checkpoint.revision)
		&& (value.checkpoint.value === undefined || isArtifactJsonValue(value.checkpoint.value));
}

export function isArtifactRun(value: unknown): value is ArtifactRun {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.bindingId !== 'string' || typeof value.actionId !== 'string'
		|| (value.actionKind !== 'code' && value.actionKind !== 'prompt') || (value.source !== 'manual' && value.source !== 'automation')
		|| typeof value.requestId !== 'string' || typeof value.actionConsent !== 'string' || typeof value.state !== 'string'
		|| !['queued', 'preparing', 'blocked', 'submitted', 'running', 'completed', 'skipped', 'failed', 'cancelled', 'interrupted'].includes(value.state)
		|| !isCounter(value.createdAt) || !isCounter(value.updatedAt) || typeof value.reason !== 'string' || typeof value.dispatched !== 'boolean') {
		return false;
	}
	return ['optionId', 'occurrenceKey', 'retryOf', 'chat'].every(key => value[key] === undefined || typeof value[key] === 'string')
		&& ['configurationRevision', 'generation'].every(key => value[key] === undefined || isCounter(value[key]))
		&& (value.admission === undefined || value.admission === 'atomic' || value.admission === 'bestEffort')
		&& (value.indeterminate === undefined || typeof value.indeterminate === 'boolean')
		&& (value.input === undefined || isArtifactJsonValue(value.input)) && (value.result === undefined || isArtifactJsonValue(value.result))
		&& (value.prompt === undefined || (isRecord(value.prompt) && typeof value.prompt.text === 'string'))
		&& (value.receipt === undefined || (isRecord(value.receipt) && (
			(value.receipt.kind === 'queued' && typeof value.receipt.queuedMessageId === 'string')
			|| (value.receipt.kind === 'turn' && typeof value.receipt.turnId === 'string'))))
		&& (value.source !== 'automation' || (typeof value.optionId === 'string' && typeof value.occurrenceKey === 'string' && isCounter(value.generation) && isCounter(value.configurationRevision)));
}

export function parseArtifactIntegrationState(raw: string, authority: string): ArtifactIntegrationState {
	const value: unknown = JSON.parse(raw);
	if (!isRecord(value) || value.version !== 1 || value.authority !== authority || !isCounter(value.revision)
		|| !Array.isArray(value.bindings) || !value.bindings.every(isBinding)
		|| !Array.isArray(value.runs) || !value.runs.every(isArtifactRun)) {
		throw new Error('Invalid artifact integration ledger');
	}
	const bindings = value.bindings;
	const runs = value.runs;
	if (new Set(bindings.map(binding => binding.id)).size !== bindings.length || new Set(runs.map(run => run.id)).size !== runs.length
		|| bindings.some(binding => binding.id !== artifactBindingId(authority, binding.session, binding.artifact.id, binding.integrationId))
		|| runs.some(run => !bindings.some(binding => binding.id === run.bindingId))) {
		throw new Error('Invalid artifact integration ledger identities');
	}
	return { version: 1, authority, revision: value.revision, bindings, runs };
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
			const next = deepClone(this.stateValue.get());
			const result = change(next);
			next.revision++;
			try {
				await this.storage.write(JSON.stringify(next));
			} catch (error) {
				this.writeFailure = error instanceof Error ? error : new Error(String(error));
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
