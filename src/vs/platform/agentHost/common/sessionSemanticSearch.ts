/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentSessionSearchMatch } from './agentHostSessionSearch.js';

export const MAX_SESSION_EMBEDDING_BATCH = 16;
export const MAX_SESSION_EMBEDDING_DIMENSIONS = 2048;

/** The caller supplies a versioned model identity; dimensions form a separate cache namespace. */
export interface ISessionEmbeddingModel {
	readonly id: string;
	readonly dimensions: number;
}

export interface ISessionEmbeddingChunk {
	readonly id: number;
	readonly contentHash: string;
	readonly text: string;
}

export interface ISessionEmbeddingValue {
	readonly id: number;
	readonly contentHash: string;
	readonly vector: readonly number[];
}

export interface ISessionSemanticMatch extends IAgentSessionSearchMatch {
	readonly score: number;
}

export type ISessionSemanticRequest =
	| { kind: 'pending'; model: ISessionEmbeddingModel }
	| { kind: 'store'; model: ISessionEmbeddingModel; values: readonly ISessionEmbeddingValue[] }
	| { kind: 'search'; model: ISessionEmbeddingModel; vector: readonly number[] };

export type ISessionSemanticResult =
	| { kind: 'pending'; chunks: readonly ISessionEmbeddingChunk[]; hasMore: boolean }
	| { kind: 'store' }
	| { kind: 'search'; matches: readonly ISessionSemanticMatch[]; hasMore: boolean; incomplete: boolean };

export function validateSessionSemanticRequest(value: unknown): asserts value is ISessionSemanticRequest {
	if (!isRecord(value) || !isRecord(value.model)
		|| typeof value.model.id !== 'string' || !value.model.id.trim() || value.model.id.length > 128
		|| typeof value.model.dimensions !== 'number' || !Number.isInteger(value.model.dimensions)
		|| value.model.dimensions < 1 || value.model.dimensions > MAX_SESSION_EMBEDDING_DIMENSIONS) {
		throw new Error('Invalid session embedding model');
	}
	switch (value.kind) {
		case 'pending':
			return;
		case 'search':
			validateVector(value.vector, value.model.dimensions);
			return;
		case 'store': {
			if (!Array.isArray(value.values) || value.values.length > 32) {
				throw new Error('Invalid session embedding batch');
			}
			const ids = new Set<number>();
			for (const entry of value.values) {
				if (!isRecord(entry)
					|| typeof entry.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id <= 0 || ids.has(entry.id)
					|| typeof entry.contentHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(entry.contentHash)) {
					throw new Error('Invalid session embedding chunk');
				}
				ids.add(entry.id);
				validateVector(entry.vector, value.model.dimensions);
			}
			return;
		}
		default:
			throw new Error('Invalid session semantic search operation');
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVector(value: unknown, dimensions: number): void {
	if (!Array.isArray(value) || value.length !== dimensions) {
		throw new Error('Invalid session embedding dimensions');
	}
	let nonzero = false;
	for (const component of value) {
		if (typeof component !== 'number' || !Number.isFinite(component)) {
			throw new Error('Session embedding components must be finite numbers');
		}
		nonzero ||= component !== 0;
	}
	if (!nonzero) {
		throw new Error('Session embedding vector must have a nonzero norm');
	}
}
