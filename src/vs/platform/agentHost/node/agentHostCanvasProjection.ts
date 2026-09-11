/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAgentHostCanvasJson, type IAgentHostCanvasAction, type IAgentHostCanvasDefinition, type IAgentHostCanvasInstance, type AgentHostCanvasJson } from '../common/agentHostCanvases.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CANVAS_IDENTITY_FIELD_MAX_LENGTH, CANVAS_MAX_DECLARED_ACTIONS, CANVAS_SCHEMA_MAX_DEPTH, CANVAS_SCHEMA_MAX_PROPERTIES, type CanvasActionDeclaration, type CanvasAvailabilityState, type CanvasEntry, type CanvasSource, type CanvasState, type CanvasTypeDeclaration } from '../common/state/protocol/channels-canvas/state.js';

export function canvasSource(extensionId: string): CanvasSource {
	if (!extensionId || extensionId.length > CANVAS_IDENTITY_FIELD_MAX_LENGTH) {
		throw new Error('The canvas provider returned an invalid extension identity.');
	}
	return { kind: CanvasSourceKind.Extension, extensionId };
}

function inlineSchema(value: AgentHostCanvasJson): NonNullable<CanvasActionDeclaration['inputSchema']> {
	if (!isAgentHostCanvasJson(value) || !isInlineSchema(value) || !schemaWithinLimits(value, 1)) {
		throw new Error('The canvas schema exceeds the supported inline schema limits.');
	}
	return value;
}

function isInlineSchema(value: AgentHostCanvasJson): value is AgentHostCanvasJson & NonNullable<CanvasActionDeclaration['inputSchema']> {
	if (typeof value !== 'object' || value === null || Array.isArray(value) || value.type !== 'object') {
		return false;
	}
	const properties = value.properties;
	const required = value.required;
	return (properties === undefined || typeof properties === 'object' && properties !== null && !Array.isArray(properties)
		&& Object.values(properties).every(property => typeof property === 'object' && property !== null && !Array.isArray(property)))
		&& (required === undefined || Array.isArray(required) && required.every(key => typeof key === 'string'));
}

function schemaWithinLimits(value: AgentHostCanvasJson, depth: number): boolean {
	if (typeof value !== 'object' || value === null) {
		return true;
	}
	if (depth > CANVAS_SCHEMA_MAX_DEPTH) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.every(item => schemaWithinLimits(item, depth));
	}
	for (const [key, child] of Object.entries(value)) {
		if (key === 'properties' && typeof child === 'object' && child !== null && !Array.isArray(child)) {
			if (Object.keys(child).length > CANVAS_SCHEMA_MAX_PROPERTIES || !Object.values(child).every(property => schemaWithinLimits(property, depth + 1))) {
				return false;
			}
		} else if (!schemaWithinLimits(child, depth + 1)) {
			return false;
		}
	}
	return true;
}

export function canvasActions(actions: readonly IAgentHostCanvasAction[]): CanvasActionDeclaration[] {
	if (actions.length > CANVAS_MAX_DECLARED_ACTIONS) {
		throw new Error('The canvas provider declared too many actions.');
	}
	return actions.map(action => {
		if (!action.name || action.name.length > CANVAS_IDENTITY_FIELD_MAX_LENGTH || (action.description?.length ?? 0) > 4096) {
			throw new Error('The canvas provider returned an invalid action declaration.');
		}
		return {
			id: action.name,
			...(action.description === undefined ? {} : { description: action.description }),
			...(action.inputSchema === undefined ? {} : { inputSchema: inlineSchema(action.inputSchema) }),
		};
	});
}

export function canvasTypeDeclaration(definition: IAgentHostCanvasDefinition, source: CanvasSource = canvasSource(definition.extensionId)): CanvasTypeDeclaration {
	if (!definition.canvasId || definition.canvasId.length > CANVAS_IDENTITY_FIELD_MAX_LENGTH || definition.displayName.length > 512 || definition.description.length > 4096) {
		throw new Error('The canvas provider returned an invalid type declaration.');
	}
	return {
		source,
		canvasType: definition.canvasId,
		title: definition.displayName,
		description: definition.description,
		...(definition.inputSchema === undefined ? {} : { openInputSchema: inlineSchema(definition.inputSchema) }),
		declaredActions: canvasActions(definition.actions),
	};
}

export function canvasAvailability(instance: IAgentHostCanvasInstance, definition: IAgentHostCanvasDefinition | undefined): CanvasAvailabilityState {
	return instance.availability === 'ready' && definition
		? { status: CanvasAvailabilityStatus.Ready, actions: canvasActions(definition.actions) }
		: { status: CanvasAvailabilityStatus.NotLoaded };
}

export function canvasEntry(state: CanvasState): CanvasEntry {
	return {
		resource: state.resource,
		identity: state.identity,
		title: state.title,
		...(state.icon ? { icon: state.icon } : {}),
		trust: state.trust,
		availability: state.availability.status,
		revision: state.revision,
	};
}
