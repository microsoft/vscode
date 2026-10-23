/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { hasAgentMetadata, type IAgentMetadataSource } from '../metadata.js';

const modelProviderKey = 'vscode.modelProvider';
const modelExecutionKey = 'vscode.modelExecution';

export interface IAgentModelProvider {
	readonly id: string;
	readonly kind: string;
	readonly label: string;
}

/** Captured for an actual call, never inferred from the requested model source. */
export interface IAgentModelExecution {
	readonly provider: IAgentModelProvider;
	readonly modelId: string;
	readonly modelDisplayName?: string;
}

function readProvider(value: unknown): IAgentModelProvider | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const fields: { id?: unknown; kind?: unknown; label?: unknown } = value;
	if (typeof fields.id !== 'string' || !fields.id.trim() || typeof fields.kind !== 'string' || !fields.kind.trim() || typeof fields.label !== 'string' || !fields.label.trim()) {
		return undefined;
	}
	return { id: fields.id, kind: fields.kind, label: fields.label };
}

export function readAgentModelProvider(source: IAgentMetadataSource | undefined): IAgentModelProvider | undefined {
	return readProvider(source?._meta?.[modelProviderKey]);
}

export function toAgentModelProviderMeta(provider: IAgentModelProvider | undefined): Record<string, unknown> | undefined {
	return provider ? { [modelProviderKey]: { id: provider.id, kind: provider.kind, label: provider.label } } : undefined;
}

export function hasAgentModelExecutionMetadata(source: IAgentMetadataSource | undefined): boolean {
	return hasAgentMetadata(source, [modelExecutionKey]);
}

export function readAgentModelExecution(source: IAgentMetadataSource | undefined): IAgentModelExecution | undefined {
	const value = source?._meta?.[modelExecutionKey];
	if (!isObject(value)) {
		return undefined;
	}
	const fields: { provider?: unknown; modelId?: unknown; modelDisplayName?: unknown } = value;
	const provider = readProvider(fields.provider);
	if (!provider || typeof fields.modelId !== 'string' || !fields.modelId.trim()
		|| (fields.modelDisplayName !== undefined && (typeof fields.modelDisplayName !== 'string' || !fields.modelDisplayName.trim()))) {
		return undefined;
	}
	return { provider, modelId: fields.modelId, ...(fields.modelDisplayName !== undefined ? { modelDisplayName: fields.modelDisplayName } : {}) };
}

export function toAgentModelExecutionMeta(execution: IAgentModelExecution | undefined): Record<string, unknown> | undefined {
	return execution ? {
		[modelExecutionKey]: {
			modelId: execution.modelId,
			provider: { id: execution.provider.id, kind: execution.provider.kind, label: execution.provider.label },
			...(execution.modelDisplayName !== undefined ? { modelDisplayName: execution.modelDisplayName } : {}),
		},
	} : undefined;
}
