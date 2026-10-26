/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { ArtifactActionDescriptor, ArtifactActor, ArtifactAuthenticationRequest, ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactIntegrationDescriptor, ArtifactJsonValue, ArtifactRecord, ArtifactRun, ArtifactSnapshot, MAX_ARTIFACT_INTEGRATION_DESCRIPTION_LENGTH, MAX_ARTIFACT_INTEGRATION_LABEL_LENGTH } from './artifactIntegration.js';
import { hasValidArtifactPresentationReferences, isArtifactActionAvailability, isArtifactContributionView, isArtifactRequestPresentation } from './artifactPresentationValidation.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isCounter(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isDictionary<T>(value: unknown, check: (item: unknown) => item is T): value is Record<string, T> {
	return isRecord(value) && Object.values(value).every(check);
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

export function parseArtifactJsonValue(serialized: string): ArtifactJsonValue {
	const value: unknown = JSON.parse(serialized);
	if (!isArtifactJsonValue(value)) {
		throw new Error('Invalid artifact JSON data');
	}
	return value;
}

export function isArtifactRecord(value: unknown): value is ArtifactRecord {
	return isRecord(value) && typeof value.id === 'string' && typeof value.resource === 'string' && typeof value.label === 'string'
		&& (value.isArtifact === undefined || typeof value.isArtifact === 'boolean')
		&& (value.origin === undefined || (isRecord(value.origin) && typeof value.origin.chat === 'string' && (value.origin.turnId === undefined || typeof value.origin.turnId === 'string')));
}

export function validateArtifactOptions(options: readonly ArtifactAutomationOption[]): void {
	const ids = new Set<string>();
	for (const option of options) {
		if (!isArtifactAutomationOption(option) || ids.has(option.id) || !isArtifactIntegrationLabel(option.label)
			|| (option.kind === 'enum' && !option.choices.every(choice => isArtifactIntegrationLabel(choice.label)))) {
			throw new Error(`Invalid or duplicate artifact automation option: ${option.id}`);
		}
		ids.add(option.id);
	}
}

// Integration text reaches agent instructions, so it stays on one line without control characters.
const controlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** A single line of plain text, short enough for compact surfaces and agent guidance. */
export function isArtifactIntegrationLabel(value: unknown): value is string {
	return typeof value === 'string' && !!value.trim() && value.length <= MAX_ARTIFACT_INTEGRATION_LABEL_LENGTH && !controlCharacters.test(value);
}

export function isArtifactIntegrationDescription(value: unknown): value is string {
	return typeof value === 'string' && !!value.trim() && value.length <= MAX_ARTIFACT_INTEGRATION_DESCRIPTION_LENGTH && !controlCharacters.test(value);
}

export function isArtifactIntegrationDescriptor(value: unknown): value is ArtifactIntegrationDescriptor {
	return isRecord(value) && typeof value.id === 'string' && !!value.id.trim() && value.id.length <= 200 && !controlCharacters.test(value.id)
		&& isArtifactIntegrationLabel(value.label)
		&& (value.description === undefined || isArtifactIntegrationDescription(value.description))
		&& Array.isArray(value.automationOptions) && value.automationOptions.length <= 50
		&& value.automationOptions.every(option => isRecord(option) && typeof option.id === 'string' && isArtifactIntegrationLabel(option.label));
}

export function isArtifactActor(value: unknown): value is ArtifactActor {
	return isRecord(value) && (value.kind === 'user'
		|| (value.kind === 'agent' && typeof value.chat === 'string' && value.chat.length > 0 && (value.turnId === undefined || typeof value.turnId === 'string')));
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
		&& (value.enabledAt === undefined || isDictionary(value.enabledAt, isCounter))
		&& (value.grants === undefined || isDictionary(value.grants, isArtifactActor))
		&& isRecord(value.disablements) && Object.values(value.disablements).every(item =>
			isRecord(item) && typeof item.reason === 'string' && isCounter(item.attempts) && (item.lastRunId === undefined || typeof item.lastRunId === 'string'));
}

export function isArtifactRun(value: unknown): value is ArtifactRun {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.bindingId !== 'string' || typeof value.integrationId !== 'string' || typeof value.actionId !== 'string'
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
		&& (value.requestedBy === undefined || isArtifactActor(value.requestedBy))
		&& (value.input === undefined || isArtifactJsonValue(value.input)) && (value.result === undefined || isArtifactJsonValue(value.result))
		&& (value.prompt === undefined || (isRecord(value.prompt) && typeof value.prompt.text === 'string'))
		&& (value.presentation === undefined || isArtifactRequestPresentation(value.presentation))
		&& (value.receipt === undefined || (isRecord(value.receipt) && (
			(value.receipt.kind === 'queued' && typeof value.receipt.queuedMessageId === 'string')
			|| (value.receipt.kind === 'turn' && typeof value.receipt.turnId === 'string'))))
		&& (value.source !== 'automation' || (typeof value.optionId === 'string' && typeof value.occurrenceKey === 'string' && isCounter(value.generation) && isCounter(value.configurationRevision)));
}

function strings(value: Record<string, unknown>, ...keys: string[]): boolean {
	return keys.every(key => typeof value[key] === 'string' && value[key].length > 0);
}

function isAuthority(value: unknown): boolean {
	return isRecord(value) && strings(value, 'id', 'targetHost') && (value.location === 'host' || value.location === 'client');
}

export function isArtifactActionDescriptor(value: unknown): value is ArtifactActionDescriptor {
	return isRecord(value) && strings(value, 'id', 'iconId', 'label') && (value.kind === 'code' || value.kind === 'prompt')
		&& (value.consentVersion === undefined || typeof value.consentVersion === 'string');
}

export function isArtifactAuthenticationRequest(value: unknown): value is ArtifactAuthenticationRequest {
	const isResource = (value: unknown): value is string => {
		if (typeof value !== 'string' || !/^https:\/\//i.test(value)) {
			return false;
		}
		const uri = URI.parse(value);
		return uri.scheme === Schemas.https && !!uri.authority && !uri.authority.includes('@') && !uri.fragment;
	};
	return isRecord(value) && isResource(value.resource)
		&& (value.authorizationServers === undefined || (Array.isArray(value.authorizationServers) && value.authorizationServers.every(isResource)))
		&& (value.scopes === undefined || (Array.isArray(value.scopes) && value.scopes.every(scope => typeof scope === 'string' && scope.length > 0)));
}

function isAuthenticationAvailability(value: unknown): boolean {
	return isArtifactActionAvailability(value) && isRecord(value) && (value.handledByIntegration === undefined || typeof value.handledByIntegration === 'boolean');
}

function isContribution(value: unknown): value is ArtifactContributionSnapshot {
	return isRecord(value) && strings(value, 'integrationId', 'label') && isArtifactConfiguration(value.configuration)
		&& (value.groupLabel === undefined || isArtifactIntegrationLabel(value.groupLabel))
		&& (value.authority === undefined || isAuthority(value.authority))
		&& (value.authentication === undefined || isAuthenticationAvailability(value.authentication))
		&& Array.isArray(value.options) && value.options.every(isArtifactAutomationOption)
		&& new Set(value.options.map(option => option.id)).size === value.options.length
		&& Array.isArray(value.actions) && value.actions.every(isArtifactActionDescriptor)
		&& new Set(value.actions.map(action => action.id)).size === value.actions.length
		&& isArtifactContributionView(value.view)
		&& hasValidArtifactPresentationReferences(value.view, new Set(value.actions.map(action => action.id)), new Set(value.options.map(option => option.id)));
}

/** Validates domain snapshots independently of their transport or runtime adapter. */
export function isArtifactSnapshot(value: unknown): value is ArtifactSnapshot {
	return isRecord(value) && isAuthority(value.authority) && strings(value, 'session') && isArtifactRecord(value.artifact)
		&& Array.isArray(value.runs) && value.runs.every(isArtifactRun)
		&& Array.isArray(value.contributions) && value.contributions.every(isContribution)
		&& new Set(value.contributions.map(contribution => contribution.integrationId)).size === value.contributions.length
		&& (value.mainIntegrationId === undefined || (typeof value.mainIntegrationId === 'string'
			&& value.contributions.some(contribution => contribution.integrationId === value.mainIntegrationId)));
}
