/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArtifactAvailability, ArtifactContributionView, ArtifactDetails, ArtifactIcon, ArtifactItemActionDescriptor, ArtifactRequestPresentation } from './artifactIntegration.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: Record<string, unknown>, ...keys: string[]): boolean {
	return keys.every(key => typeof value[key] === 'string' && value[key].length > 0);
}

export function isArtifactAvailability(value: unknown): value is ArtifactAvailability {
	return isRecord(value) && (value.kind === 'loading' || value.kind === 'available'
		|| (['stale', 'authenticationRequired', 'unavailable', 'error'].includes(String(value.kind)) && typeof value.reason === 'string'))
		&& (value.observedAt === undefined || (typeof value.observedAt === 'number' && Number.isFinite(value.observedAt)));
}

export function isArtifactIcon(value: unknown): value is ArtifactIcon {
	return isRecord(value) && typeof value.id === 'string' && /^[a-zA-Z0-9-]+$/.test(value.id)
		&& (value.colorId === undefined || (typeof value.colorId === 'string' && /^[a-zA-Z0-9.-]+$/.test(value.colorId)));
}

function isPart(value: unknown): boolean {
	return isRecord(value) && isArtifactIcon(value.icon) && strings(value, 'label', 'detailsId')
		&& (value.description === undefined || typeof value.description === 'string');
}

export function isArtifactActionAvailability(value: unknown): boolean {
	return isRecord(value) && typeof value.enabled === 'boolean' && (value.disabledReason === undefined || typeof value.disabledReason === 'string');
}

export function isArtifactContributionView(value: unknown): value is ArtifactContributionView {
	return isRecord(value) && isArtifactAvailability(value.availability)
		&& (value.main === undefined || isPart(value.main))
		&& (value.group === undefined || (isRecord(value.group) && isArtifactIcon(value.group.icon) && typeof value.group.priority === 'number' && Number.isFinite(value.group.priority)))
		&& Array.isArray(value.sections) && value.sections.every(section => isRecord(section) && strings(section, 'id') && isPart(section))
		&& new Set(value.sections.map(section => section.id)).size === value.sections.length
		&& (value.lists === undefined || (Array.isArray(value.lists)
			&& value.lists.every(list => isRecord(list) && strings(list, 'id', 'label', 'detailsId') && (list.icon === undefined || isArtifactIcon(list.icon)))
			&& new Set(value.lists.map(list => list.id)).size === value.lists.length))
		&& Array.isArray(value.stateActions) && Array.isArray(value.generalActions)
		&& [value.stateActions, value.generalActions].every(actions => actions.every(action =>
			isRecord(action) && strings(action, 'id') && isArtifactActionAvailability(action)
			&& (action.chatAvailability === undefined || (isRecord(action.chatAvailability) && Object.entries(action.chatAvailability).every(([chat, availability]) => chat.length > 0 && isArtifactActionAvailability(availability))))))
		&& new Set([...value.stateActions, ...value.generalActions].map(action => action.id)).size === value.stateActions.length + value.generalActions.length
		&& Array.isArray(value.automationAvailability) && value.automationAvailability.every(option => isRecord(option) && strings(option, 'id') && typeof option.available === 'boolean'
			&& (option.unavailableReason === undefined || typeof option.unavailableReason === 'string')
			&& (option.enablement === undefined || isArtifactActionAvailability(option.enablement)))
		&& new Set(value.automationAvailability.map(option => option.id)).size === value.automationAvailability.length;
}

/** References target registered descriptors, not only actions currently applicable to the resource. */
export function hasValidArtifactPresentationReferences(view: ArtifactContributionView, actionIds: ReadonlySet<string>, optionIds: ReadonlySet<string>): boolean {
	return [...view.stateActions, ...view.generalActions].every(action => actionIds.has(action.id))
		&& view.automationAvailability.every(option => optionIds.has(option.id));
}

function isItemActionDescriptor(value: unknown): value is ArtifactItemActionDescriptor {
	return isRecord(value) && strings(value, 'id', 'label') && isArtifactIcon({ id: value.iconId });
}

function isUniqueStringList(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0) && new Set(value).size === value.length;
}

export function isArtifactDetails(value: unknown): value is ArtifactDetails {
	if (!isRecord(value)) {
		return false;
	}
	const actions = value.itemActions ?? [];
	if (!Array.isArray(actions) || !actions.every(isItemActionDescriptor)) {
		return false;
	}
	const itemActions = new Set(actions.map(action => action.id));
	return isArtifactAvailability(value.availability) && typeof value.title === 'string'
		&& (value.description === undefined || typeof value.description === 'string')
		&& (value.descriptionFormat === undefined || value.descriptionFormat === 'plaintext' || value.descriptionFormat === 'markdown')
		&& (value.completeness === 'complete' || value.completeness === 'partial')
		&& (value.facts === undefined || (Array.isArray(value.facts) && value.facts.every(fact => isRecord(fact) && strings(fact, 'id', 'label') && typeof fact.value === 'string')))
		&& Array.isArray(value.links) && value.links.every(link => isRecord(link) && (link.kind === 'action' ? strings(link, 'actionId') : link.kind === 'automation' && strings(link, 'optionId')))
		&& itemActions.size === actions.length
		&& Array.isArray(value.items) && value.items.length <= 200 && value.items.every(item => isRecord(item) && strings(item, 'id', 'label', 'resource') && isArtifactIcon(item.icon) && (item.description === undefined || typeof item.description === 'string')
			&& (item.actions === undefined || (isUniqueStringList(item.actions) && item.actions.every(action => itemActions.has(action)))))
		&& new Set(value.items.map(item => item.id)).size === value.items.length;
}

export function isArtifactRequestPresentation(value: unknown): value is ArtifactRequestPresentation {
	return isRecord(value) && value.version === 1 && strings(value, 'integrationLabel')
		&& (value.source === 'manual' || value.source === 'automation')
		&& isRecord(value.action) && strings(value.action, 'label', 'iconId')
		&& isRecord(value.artifact) && strings(value.artifact, 'resource', 'label')
		&& (value.artifact.description === undefined || typeof value.artifact.description === 'string')
		&& (value.artifact.icon === undefined || isArtifactIcon(value.artifact.icon))
		&& Array.isArray(value.details) && value.details.every(isArtifactDetails);
}
