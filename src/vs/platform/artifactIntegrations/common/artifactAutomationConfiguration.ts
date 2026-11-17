/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../base/common/equals.js';
import { localize } from '../../../nls.js';
import { ArtifactAction, ArtifactActor, ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactContributionSnapshot, artifactOptionDisabledValue, isArtifactOptionEnabled } from './artifactIntegration.js';

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

export function applyArtifactAutomationSelection(
	configuration: ArtifactAutomationConfiguration,
	options: readonly ArtifactAutomationOption[],
	consent: Readonly<Record<string, string>>,
	values: Readonly<Record<string, boolean | string>>,
	signatures: Readonly<Record<string, string | undefined>>,
	enabledAt: number,
	actor: ArtifactActor = { kind: 'user' },
): { readonly configuration: ArtifactAutomationConfiguration; readonly consent: Readonly<Record<string, string>> } {
	const nextValues = { ...configuration.values };
	const nextGenerations = { ...configuration.generations };
	const nextEnabledAt = { ...configuration.enabledAt };
	const nextGrants = { ...configuration.grants };
	const nextDisablements = { ...configuration.disablements };
	const nextConsent = { ...consent };
	for (const [optionId, value] of Object.entries(values)) {
		const option = options.find(option => option.id === optionId);
		if (!option) {
			throw new Error(`Unknown artifact automation option: ${optionId}`);
		}
		const signature = signatures[optionId];
		if (isArtifactOptionEnabled(option, value) && (value !== configuration.values[optionId] || consent[optionId] !== signature)) {
			nextGenerations[optionId] = (nextGenerations[optionId] ?? 0) + 1;
			nextEnabledAt[optionId] = enabledAt;
			nextGrants[optionId] = actor;
		}
		nextValues[optionId] = value;
		if (signature) {
			nextConsent[optionId] = signature;
		}
		delete nextDisablements[optionId];
	}
	return {
		configuration: {
			revision: configuration.revision + 1,
			values: nextValues,
			generations: nextGenerations,
			enabledAt: nextEnabledAt,
			grants: nextGrants,
			disablements: nextDisablements,
		},
		consent: nextConsent,
	};
}

export function reconcileArtifactAutomationOptions(
	storedOptions: readonly ArtifactAutomationOption[],
	currentOptions: readonly ArtifactAutomationOption[],
	configuration: ArtifactAutomationConfiguration,
	consent: Readonly<Record<string, string>>,
	actions: readonly ArtifactAction[],
	disablementReason: string,
): { readonly options: readonly ArtifactAutomationOption[]; readonly configuration: ArtifactAutomationConfiguration; readonly changed: boolean } {
	const options = [...currentOptions, ...storedOptions.filter(option => !currentOptions.some(current => current.id === option.id))];
	const values = { ...configuration.values };
	const generations = { ...configuration.generations };
	const disablements = { ...configuration.disablements };
	for (const option of options) {
		const current = currentOptions.find(current => current.id === option.id);
		const previous = storedOptions.find(previous => previous.id === option.id);
		const wasEnabled = previous && isArtifactOptionEnabled(previous, values[option.id]);
		const sameConsent = current && consent[option.id] === artifactOptionConsent(current, actions);
		const validValue = option.kind === 'boolean' ? typeof values[option.id] === 'boolean' : option.choices.some(choice => choice.value === values[option.id]);
		if (!previous || !current || !sameConsent || !validValue) {
			values[option.id] = artifactOptionDisabledValue(option);
			generations[option.id] ??= 0;
			if (wasEnabled) {
				disablements[option.id] = { reason: disablementReason, attempts: 0 };
			}
		}
	}
	const changed = !structuralEquals(options, storedOptions) || !structuralEquals(values, configuration.values);
	return {
		options,
		changed,
		configuration: changed ? {
			revision: configuration.revision + 1,
			values,
			generations,
			enabledAt: configuration.enabledAt,
			grants: configuration.grants,
			disablements,
		} : configuration,
	};
}

export function disableArtifactAutomation(
	configuration: ArtifactAutomationConfiguration,
	option: ArtifactAutomationOption,
	reason: string,
): ArtifactAutomationConfiguration {
	return {
		...configuration,
		revision: configuration.revision + 1,
		values: { ...configuration.values, [option.id]: artifactOptionDisabledValue(option) },
		disablements: { ...configuration.disablements, [option.id]: { reason, attempts: 0 } },
	};
}

/** Whether an option can be turned on now. Turning an option off is always allowed. */
export function canEnableArtifactAutomationOption(contribution: Pick<ArtifactContributionSnapshot, 'view'>, option: ArtifactAutomationOption): boolean {
	const available = contribution.view.automationAvailability.find(candidate => candidate.id === option.id);
	return contribution.view.availability.kind === 'available' && available?.available === true && available.enablement?.enabled !== false
		&& (option.kind !== 'enum' || option.choices.some(choice => choice.value !== option.disabledValue));
}

/** A selection that names an unknown option, uses an invalid value, or turns on an option that cannot be turned on. */
export class ArtifactAutomationSelectionError extends Error {
	constructor(readonly optionId: string, message: string) {
		super(message);
		this.name = 'ArtifactAutomationSelectionError';
	}
}

/** Validates a selection against an integration's options and current availability, for every surface that changes automation. */
export function validateArtifactAutomationSelection(contribution: Pick<ArtifactContributionSnapshot, 'options' | 'view'>, values: Readonly<Record<string, boolean | string>>): void {
	for (const [optionId, value] of Object.entries(values)) {
		const option = contribution.options.find(option => option.id === optionId);
		if (!option) {
			throw new ArtifactAutomationSelectionError(optionId, localize('artifactUnknownAutomationOption', "Unknown automation option \"{0}\".", optionId));
		}
		if (option.kind === 'boolean' ? typeof value !== 'boolean' : !option.choices.some(choice => choice.value === value)) {
			throw new ArtifactAutomationSelectionError(optionId, option.kind === 'boolean'
				? localize('artifactBooleanAutomationOption', "\"{0}\" takes true or false.", optionId)
				: localize('artifactEnumAutomationOption', "\"{0}\" takes one of: {1}.", optionId, option.choices.map(choice => choice.value).join(', ')));
		}
		if (isArtifactOptionEnabled(option, value) && !canEnableArtifactAutomationOption(contribution, option)) {
			const available = contribution.view.automationAvailability.find(candidate => candidate.id === option.id);
			const availability = contribution.view.availability;
			const reason = available?.enablement?.enabled === false ? available.enablement.disabledReason
				: available?.unavailableReason ?? (availability.kind !== 'available' && availability.kind !== 'loading' ? availability.reason : undefined);
			throw new ArtifactAutomationSelectionError(optionId, reason
				? localize('artifactAutomationCannotEnableReason', "{0} cannot be turned on: {1}", option.label, reason)
				: localize('artifactAutomationCannotEnable', "{0} is unavailable and cannot be turned on.", option.label));
		}
	}
}
