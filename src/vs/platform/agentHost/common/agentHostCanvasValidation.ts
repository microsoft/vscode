/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { CANVAS_IDENTITY_FIELD_MAX_LENGTH, CANVAS_INPUT_MAX_LENGTH, CANVAS_MAX_DECLARED_ACTIONS, CANVAS_REQUEST_ID_MAX_LENGTH, CANVAS_SCHEMA_MAX_DEPTH, CANVAS_SCHEMA_MAX_PROPERTIES, CanvasSourceKind, type CanvasActionDeclaration, type CanvasEntry, type CanvasIdentityKey, type CanvasSource, type CanvasState, type CanvasTypeDeclaration } from './state/protocol/channels-canvas/state.js';
import { JsonRpcErrorCodes, ProtocolError } from './state/sessionProtocol.js';
import { parseChatUri } from './state/sessionState.js';
import type { Icon } from './state/protocol/common/state.js';

export const AHP_CANVAS_SCHEME = 'ahp-canvas';
export type CanvasMethod = 'listCanvasTypes' | 'openCanvas' | 'resolveCanvasSource' | 'invokeCanvasAction' | 'restartCanvasProvider' | 'closeCanvas';

export function isCanvasMethod(method: string): method is CanvasMethod {
	return method === 'listCanvasTypes' || method === 'openCanvas' || method === 'resolveCanvasSource'
		|| method === 'invokeCanvasAction' || method === 'restartCanvasProvider' || method === 'closeCanvas';
}

export function isCanvasRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCanvasResource(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2048) {
		return false;
	}
	try {
		const uri = URI.parse(value);
		return uri.scheme === AHP_CANVAS_SCHEME && uri.path.length > 1 && !uri.authority && !uri.query && !uri.fragment;
	} catch {
		return false;
	}
}

function isIdentityField(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= CANVAS_IDENTITY_FIELD_MAX_LENGTH;
}

export function isCanvasSource(value: unknown): value is CanvasSource {
	return isCanvasRecord(value) && (value.kind === CanvasSourceKind.Extension
		? isIdentityField(value.extensionId)
		: value.kind === CanvasSourceKind.Package && isIdentityField(value.sourceId) && typeof value.packageName === 'string' && value.packageName.length <= 256)
		&& (value.version === undefined || typeof value.version === 'string' && value.version.length <= 256);
}

export function isCanvasIdentity(value: unknown): value is CanvasIdentityKey {
	return isCanvasRecord(value) && typeof value.chat === 'string' && value.chat.length <= 8192
		&& isCanvasChat(value.chat) && isCanvasSource(value.source)
		&& isIdentityField(value.canvasType) && isIdentityField(value.instanceId);
}

function isCanvasChat(value: string): boolean {
	try {
		return !!parseChatUri(value);
	} catch {
		return false;
	}
}

export function isCanvasIcon(value: unknown): value is Icon {
	if (!isBoundedCanvasJson(value, 4096) || !isCanvasRecord(value) || typeof value.src !== 'string'
		|| value.contentType !== undefined && typeof value.contentType !== 'string'
		|| value.theme !== undefined && value.theme !== 'dark' && value.theme !== 'light'
		|| value.sizes !== undefined && (!Array.isArray(value.sizes) || !value.sizes.every(size => typeof size === 'string' && /^(?:any|[1-9][0-9]*x[1-9][0-9]*)$/.test(size)))) {
		return false;
	}
	try {
		const uri = URI.parse(value.src);
		return (uri.scheme === 'file' && uri.path.startsWith('/') && !uri.authority && !uri.query && !uri.fragment) || /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src);
	} catch {
		return false;
	}
}

export function canvasSourceKey(source: CanvasSource): string {
	return JSON.stringify(source.kind === CanvasSourceKind.Extension ? [source.kind, source.extensionId] : [source.kind, source.sourceId]);
}

export function canvasIdentityKey(identity: CanvasIdentityKey): string {
	return JSON.stringify([identity.chat, canvasSourceKey(identity.source), identity.canvasType, identity.instanceId]);
}

export function canvasEntry(state: CanvasState): CanvasEntry {
	return {
		resource: state.resource, identity: state.identity, title: state.title,
		...(state.icon === undefined ? {} : { icon: state.icon }),
		trust: state.trust, availability: state.availability.status, revision: state.revision,
	};
}

/** Rejects non-JSON values without invoking getters, custom prototypes, or toJSON. */
export function isBoundedCanvasJson(value: unknown, maxLength = CANVAS_INPUT_MAX_LENGTH): boolean {
	let nodes = 0;
	const ancestors = new Set<object>();
	const visit = (candidate: unknown, depth: number): boolean => {
		if (++nodes > maxLength || depth > 64) {
			return false;
		}
		if (candidate === null || typeof candidate === 'boolean') {
			return true;
		}
		if (typeof candidate === 'string') {
			return candidate.length <= maxLength;
		}
		if (typeof candidate === 'number') {
			return Number.isFinite(candidate);
		}
		if (typeof candidate !== 'object' || ancestors.has(candidate)) {
			return false;
		}
		const array = Array.isArray(candidate);
		const prototype = Object.getPrototypeOf(candidate);
		if (prototype !== (array ? Array.prototype : Object.prototype) && (array || prototype !== null)) {
			return false;
		}
		if (Object.getOwnPropertySymbols(candidate).length) {
			return false;
		}
		ancestors.add(candidate);
		try {
			const keys = Object.getOwnPropertyNames(candidate);
			if (array && keys.length !== candidate.length + 1) {
				return false;
			}
			for (const key of keys) {
				if (array && key === 'length') {
					continue;
				}
				if (array && (String(Number(key)) !== key || !Number.isSafeInteger(Number(key)) || Number(key) < 0 || Number(key) >= candidate.length)) {
					return false;
				}
				const property = Object.getOwnPropertyDescriptor(candidate, key);
				if (key.length > maxLength || !property || !Object.hasOwn(property, 'value') || !property.enumerable || !visit(property.value, depth + 1)) {
					return false;
				}
			}
			return true;
		} finally {
			ancestors.delete(candidate);
		}
	};
	try {
		return visit(value, 1) && JSON.stringify(value).length <= maxLength;
	} catch {
		return false;
	}
}

export function validateCanvasRequest(method: CanvasMethod, params: unknown): void {
	if (!isCanvasRecord(params) || typeof params.channel !== 'string' || params.channel.length > 8192) {
		throw invalidCanvasParams();
	}
	if (params.input !== undefined && !isBoundedCanvasJson(params.input)) {
		throw invalidCanvasParams('Canvas input must be bounded JSON.');
	}
	if (method === 'listCanvasTypes') {
		if (!isCanvasChat(params.channel) || params.limit !== undefined && (!Number.isSafeInteger(params.limit) || typeof params.limit !== 'number' || params.limit < 1 || params.limit > 64)
			|| params.cursor !== undefined && (typeof params.cursor !== 'string' || params.cursor.length > 256)) {
			throw invalidCanvasParams();
		}
		return;
	}
	if (method !== 'resolveCanvasSource' && (typeof params.requestId !== 'string' || !params.requestId.length || params.requestId.length > CANVAS_REQUEST_ID_MAX_LENGTH)) {
		throw invalidCanvasParams();
	}
	if (method === 'openCanvas') {
		if (!isCanvasResource(params.canvas) || !isCanvasIdentity(params.identity) || parseChatUri(params.identity.chat)?.session !== params.channel
			|| typeof params.title !== 'string' || params.title.length > 4096 || params.icon !== undefined && !isCanvasIcon(params.icon)) {
			throw invalidCanvasParams();
		}
		return;
	}
	if (!isCanvasResource(params.channel)) {
		throw invalidCanvasParams();
	}
	if ((method === 'invokeCanvasAction' || method === 'restartCanvasProvider') && !isIdentityField(params.incarnation)) {
		throw invalidCanvasParams();
	}
	if (method === 'invokeCanvasAction' && !isIdentityField(params.actionId)) {
		throw invalidCanvasParams();
	}
	if (method === 'closeCanvas' && (typeof params.revision !== 'number' || !Number.isSafeInteger(params.revision) || params.revision < 0)) {
		throw invalidCanvasParams();
	}
}

/** Counts schema-bearing nesting, including combinators and local references, rather than only properties. */
export function isInlineCanvasSchema(schema: unknown): schema is NonNullable<CanvasActionDeclaration['inputSchema']> {
	if (!isBoundedCanvasJson(schema) || !isCanvasRecord(schema) || schema.type !== 'object') {
		return false;
	}
	const active = new Set<object>();
	const visit = (value: unknown, depth: number): boolean => {
		if (typeof value === 'boolean') {
			return depth <= CANVAS_SCHEMA_MAX_DEPTH;
		}
		if (!isCanvasRecord(value) || depth > CANVAS_SCHEMA_MAX_DEPTH || active.has(value)) {
			return false;
		}
		active.add(value);
		try {
			if (value.required !== undefined && (!Array.isArray(value.required) || !value.required.every(entry => typeof entry === 'string') || new Set(value.required).size !== value.required.length)) {
				return false;
			}
			for (const [key, child] of Object.entries(value)) {
				if (key === '$ref') {
					if (typeof child !== 'string' || !child.startsWith('#/')) {
						return false;
					}
					let target: unknown = schema;
					for (const part of child.slice(2).split('/')) {
						const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
						target = isCanvasRecord(target) && Object.hasOwn(target, decoded) ? target[decoded] : undefined;
					}
					if (!visit(target, depth)) {
						return false;
					}
				} else if (key === 'properties' || key === 'patternProperties' || key === '$defs' || key === 'definitions' || key === 'dependentSchemas') {
					if (!isCanvasRecord(child) || Object.keys(child).length > CANVAS_SCHEMA_MAX_PROPERTIES || !Object.values(child).every(entry => visit(entry, depth + 1))) {
						return false;
					}
				} else if (key === 'dependencies') {
					if (!isCanvasRecord(child) || Object.keys(child).length > CANVAS_SCHEMA_MAX_PROPERTIES
						|| !Object.values(child).every(entry => Array.isArray(entry) ? entry.every(item => typeof item === 'string') : visit(entry, depth + 1))) {
						return false;
					}
				} else if (['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(key) || key === 'items' && Array.isArray(child)) {
					if (!Array.isArray(child) || !child.every(entry => visit(entry, depth + 1))) {
						return false;
					}
				} else if (['items', 'additionalItems', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'unevaluatedProperties', 'unevaluatedItems', 'contentSchema'].includes(key) && !visit(child, depth + 1)) {
					return false;
				}
			}
			return true;
		} finally {
			active.delete(value);
		}
	};
	return visit(schema, 1);
}

export function validateCanvasActions(actions: readonly CanvasActionDeclaration[]): void {
	if (!Array.isArray(actions) || actions.length > CANVAS_MAX_DECLARED_ACTIONS || !actions.every(isCanvasRecord) || new Set(actions.map(action => action.id)).size !== actions.length) {
		throw invalidCanvasParams('The provider action declarations exceed the canvas contract.');
	}
	for (const action of actions) {
		if (!isIdentityField(action.id) || action.title !== undefined && (typeof action.title !== 'string' || action.title.length > 4096)
			|| action.description !== undefined && (typeof action.description !== 'string' || action.description.length > 8192)) {
			throw invalidCanvasParams('The provider declared an invalid action.');
		}
		validateCanvasSchemaDeclaration(action.inputSchema, action.inputSchemaRef);
	}
}

export function validateCanvasType(type: CanvasTypeDeclaration): void {
	if (!isCanvasRecord(type) || !isCanvasSource(type.source) || !isIdentityField(type.canvasType) || typeof type.title !== 'string' || type.title.length > 4096
		|| type.icon !== undefined && !isCanvasIcon(type.icon) || type.description !== undefined && (typeof type.description !== 'string' || type.description.length > 8192)) {
		throw invalidCanvasParams('The provider declared an invalid canvas type.');
	}
	validateCanvasSchemaDeclaration(type.openInputSchema, type.openInputSchemaRef);
	if (type.declaredActions !== undefined) {
		validateCanvasActions(type.declaredActions);
	}
}

export function validateCanvasSchemaDeclaration(schema: unknown, reference: unknown): void {
	if (schema !== undefined && reference !== undefined
		|| schema !== undefined && !isInlineCanvasSchema(schema)
		|| reference !== undefined && (typeof reference !== 'string' || reference.length === 0 || reference.length > 2048)) {
		throw invalidCanvasParams('Unsupported canvas schema declaration; use a resolvable schema reference for larger schemas.');
	}
}

export function invalidCanvasParams(message = 'Invalid canvas parameters.'): ProtocolError {
	return new ProtocolError(JsonRpcErrorCodes.InvalidParams, message);
}
