/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import type { JsonPrimitive } from './state/protocol/state.js';

export type AgentHostCanvasJson = JsonPrimitive | AgentHostCanvasJson[] | { [key: string]: AgentHostCanvasJson };

export interface IAgentHostCanvasAction {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema?: AgentHostCanvasJson;
}

export interface IAgentHostCanvasDefinition {
	readonly extensionId: string;
	readonly canvasId: string;
	readonly displayName: string;
	readonly description: string;
	readonly inputSchema?: AgentHostCanvasJson;
	readonly actions: readonly IAgentHostCanvasAction[];
}

interface IAgentHostCanvasIdentity {
	readonly instanceId: string;
	readonly extensionId: string;
	readonly canvasId: string;
	readonly title?: string;
	readonly input?: AgentHostCanvasJson;
}

/** Logical canvas identity survives the loss of its transient rendering endpoint. */
export type IAgentHostCanvasInstance = IAgentHostCanvasIdentity & (
	| { readonly availability: 'ready'; readonly url: string }
	| { readonly availability: 'unavailable'; readonly url?: never }
);

export interface IAgentHostCanvasState {
	readonly supported: boolean;
	/** False when the backing is not live; an empty unresolved read is not a membership snapshot. */
	readonly loaded?: boolean;
	readonly catalog: readonly IAgentHostCanvasDefinition[];
	readonly instances: readonly IAgentHostCanvasInstance[];
}

export interface IAgentHostCanvasOpenParams {
	readonly extensionId: string;
	readonly canvasId: string;
	readonly instanceId: string;
	readonly input?: AgentHostCanvasJson;
}

export interface IAgentHostCanvasActionParams {
	readonly instanceId: string;
	readonly actionName: string;
	readonly input?: AgentHostCanvasJson;
}

export interface IAgentHostCanvasOperations {
	getCanvases?(chat: URI): Promise<IAgentHostCanvasState>;
	openCanvas?(chat: URI, params: IAgentHostCanvasOpenParams): Promise<IAgentHostCanvasInstance>;
	/** Copilot returns its SDK envelope, `{ result: providerJSON }`, without unwrapping or replay. */
	invokeCanvasAction?(chat: URI, params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson>;
	closeCanvas?(chat: URI, instanceId: string): Promise<void>;
	reloadCanvases?(chat: URI): Promise<void>;
}

export interface IAgentHostCanvasStateChange {
	readonly chat: URI;
	readonly state: IAgentHostCanvasState;
}

/** Session metadata slot containing canvas state indexed by exact chat URI. */
export const AgentHostCanvasesMetaKey = 'vscode.localCanvases';

export const unsupportedAgentHostCanvasState: IAgentHostCanvasState = { supported: false, catalog: [], instances: [] };

export const AgentHostCanvasJsonLimits = { maxDepth: 32, maxNodes: 16384, maxBytes: 64 * 1024 } as const;

export function isAgentHostCanvasJson(value: unknown): value is AgentHostCanvasJson {
	let nodes = 0;
	let characters = 0;
	const ancestors = new Set<object>();
	const visit = (candidate: unknown, depth: number): boolean => {
		if (++nodes > AgentHostCanvasJsonLimits.maxNodes || depth > AgentHostCanvasJsonLimits.maxDepth) {
			return false;
		}
		if (typeof candidate === 'string') {
			characters += candidate.length;
			return characters <= AgentHostCanvasJsonLimits.maxBytes;
		}
		if (candidate === null || typeof candidate === 'boolean') {
			return true;
		}
		if (typeof candidate === 'number') {
			return Number.isFinite(candidate);
		}
		if (!Array.isArray(candidate) && (!isRecord(candidate)
			|| (Object.getPrototypeOf(candidate) !== Object.prototype && Object.getPrototypeOf(candidate) !== null))) {
			return false;
		}
		if (ancestors.has(candidate)) {
			return false;
		}
		ancestors.add(candidate);
		try {
			if (Array.isArray(candidate)) {
				if (Object.getPrototypeOf(candidate) !== Array.prototype || candidate.length > AgentHostCanvasJsonLimits.maxNodes - nodes
					|| Object.getOwnPropertyNames(candidate).some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) {
					return false;
				}
				for (let index = 0; index < candidate.length; index++) {
					const descriptor = Object.getOwnPropertyDescriptor(candidate, index);
					if (!descriptor || !Object.hasOwn(descriptor, 'value') || !visit(descriptor.value, depth + 1)) {
						return false;
					}
				}
				return true;
			}
			for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) {
				characters += key.length;
				if (characters > AgentHostCanvasJsonLimits.maxBytes || !Object.hasOwn(descriptor, 'value') || !visit(descriptor.value, depth + 1)) {
					return false;
				}
			}
			return true;
		} finally {
			ancestors.delete(candidate);
		}
	};
	return visit(value, 0) && VSBuffer.fromString(JSON.stringify(value)).byteLength <= AgentHostCanvasJsonLimits.maxBytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanvasAction(value: unknown): value is IAgentHostCanvasAction {
	return isRecord(value)
		&& typeof value.name === 'string'
		&& (value.description === undefined || typeof value.description === 'string')
		&& (value.inputSchema === undefined || isAgentHostCanvasJson(value.inputSchema));
}

function isCanvasDefinition(value: unknown): value is IAgentHostCanvasDefinition {
	return isRecord(value)
		&& typeof value.extensionId === 'string'
		&& typeof value.canvasId === 'string'
		&& typeof value.displayName === 'string'
		&& typeof value.description === 'string'
		&& (value.inputSchema === undefined || isAgentHostCanvasJson(value.inputSchema))
		&& Array.isArray(value.actions) && value.actions.every(isCanvasAction);
}

function isCanvasInstance(value: unknown): value is IAgentHostCanvasInstance {
	return isRecord(value)
		&& typeof value.instanceId === 'string'
		&& typeof value.extensionId === 'string'
		&& typeof value.canvasId === 'string'
		&& (value.title === undefined || typeof value.title === 'string')
		&& (value.input === undefined || isAgentHostCanvasJson(value.input))
		&& (value.availability === 'ready' ? typeof value.url === 'string' : value.availability === 'unavailable' && value.url === undefined);
}

export function readAgentHostCanvasState(meta: Readonly<Record<string, unknown>> | undefined, chat: URI | string): IAgentHostCanvasState | undefined {
	const chats = meta?.[AgentHostCanvasesMetaKey];
	const state = isRecord(chats) ? chats[typeof chat === 'string' ? chat : chat.toString()] : undefined;
	if (!isRecord(state) || typeof state.supported !== 'boolean' || state.loaded !== undefined && typeof state.loaded !== 'boolean' || !Array.isArray(state.catalog) || !Array.isArray(state.instances)
		|| !state.catalog.every(isCanvasDefinition) || !state.instances.every(isCanvasInstance)) {
		return undefined;
	}
	return { supported: state.supported, ...(state.loaded === undefined ? {} : { loaded: state.loaded }), catalog: state.catalog, instances: state.instances };
}

export function withAgentHostCanvasState(meta: Readonly<Record<string, unknown>> | undefined, chat: URI | string, state: IAgentHostCanvasState): Record<string, unknown> {
	const chats = meta?.[AgentHostCanvasesMetaKey];
	return {
		...meta,
		[AgentHostCanvasesMetaKey]: {
			...(isRecord(chats) ? chats : {}),
			[typeof chat === 'string' ? chat : chat.toString()]: state,
		},
	};
}

export function withoutAgentHostCanvasState(meta: Readonly<Record<string, unknown>> | undefined, chat: URI): Record<string, unknown> | undefined {
	const chats = meta?.[AgentHostCanvasesMetaKey];
	if (!isRecord(chats) || !Object.hasOwn(chats, chat.toString())) {
		return meta;
	}
	const remaining = { ...chats };
	delete remaining[chat.toString()];
	const result = { ...meta };
	if (Object.keys(remaining).length) {
		result[AgentHostCanvasesMetaKey] = remaining;
	} else {
		delete result[AgentHostCanvasesMetaKey];
	}
	return result;
}
