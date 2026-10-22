/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { hasAgentMetadata, type IAgentMetadataSource } from '../metadata.js';

const modelProviderKey = 'vscode.modelProvider';
const modelExecutionKey = 'vscode.modelExecution';

/** The model provider, distinct from the agent harness and the model's manufacturer. */
export interface IAgentModelProvider {
	readonly id: string;
	readonly kind: string;
	readonly label: string;
}

/** Attribution captured for an actual model call, not inferred from the current selection. */
export interface IAgentModelExecution {
	readonly provider: IAgentModelProvider;
	readonly modelId: string;
	readonly modelDisplayName?: string;
}

function readProvider(value: unknown): IAgentModelProvider | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { id, kind, label } = value as Record<string, unknown>;
	if (typeof id !== 'string' || !id.trim() || typeof kind !== 'string' || !kind.trim() || typeof label !== 'string' || !label.trim()) {
		return undefined;
	}
	return { id, kind, label };
}

export function readAgentModelProvider(source: IAgentMetadataSource | undefined): IAgentModelProvider | undefined {
	return readProvider(source?._meta?.[modelProviderKey]);
}

export function hasAgentModelProviderMetadata(source: IAgentMetadataSource | undefined): boolean {
	return hasAgentMetadata(source, [modelProviderKey]);
}

export function toAgentModelProviderMeta(provider: IAgentModelProvider | undefined): Record<string, unknown> | undefined {
	return provider ? { [modelProviderKey]: { id: provider.id, kind: provider.kind, label: provider.label } } : undefined;
}

export function readAgentModelExecution(source: IAgentMetadataSource | undefined): IAgentModelExecution | undefined {
	const value = source?._meta?.[modelExecutionKey];
	if (!isObject(value)) {
		return undefined;
	}
	const data = value as Record<string, unknown>;
	const { modelId, modelDisplayName } = data;
	if (typeof modelId !== 'string' || !modelId.trim() || (modelDisplayName !== undefined && (typeof modelDisplayName !== 'string' || !modelDisplayName.trim()))) {
		return undefined;
	}
	const provider = readProvider(data.provider);
	return provider ? {
		provider,
		modelId,
		...(modelDisplayName !== undefined ? { modelDisplayName } : {}),
	} : undefined;
}

export function hasAgentModelExecutionMetadata(source: IAgentMetadataSource | undefined): boolean {
	return hasAgentMetadata(source, [modelExecutionKey]);
}

export function toAgentModelExecutionMeta(execution: IAgentModelExecution | undefined): Record<string, unknown> | undefined {
	return execution ? {
		[modelExecutionKey]: {
			provider: { id: execution.provider.id, kind: execution.provider.kind, label: execution.provider.label },
			modelId: execution.modelId,
			...(execution.modelDisplayName !== undefined ? { modelDisplayName: execution.modelDisplayName } : {}),
		},
	} : undefined;
}
