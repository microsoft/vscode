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
	/** When present, `id` is a captured configuration/binding identity, not a legacy product reference. */
	readonly binding?: {
		readonly source: string;
		readonly accountRef?: { readonly selectionId: string };
	};
}

/** Attribution captured for an actual model call, not inferred from the current selection. */
export interface IAgentModelExecution {
	readonly provider: IAgentModelProvider;
	readonly modelId: string;
	readonly modelDisplayName?: string;
}

export function parseAgentModelProvider(value: unknown): IAgentModelProvider | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const { id, kind, label } = raw;
	if (typeof id !== 'string' || !id.trim() || typeof kind !== 'string' || !kind.trim() || typeof label !== 'string' || !label.trim()) {
		return undefined;
	}
	let binding: IAgentModelProvider['binding'];
	if (raw.binding !== undefined) {
		if (!isObject(raw.binding)) {
			return undefined;
		}
		const data = raw.binding as Record<string, unknown>;
		if (typeof data.source !== 'string' || !data.source.trim()) {
			return undefined;
		}
		let accountRef: NonNullable<IAgentModelProvider['binding']>['accountRef'];
		if (data.accountRef !== undefined) {
			if (!isObject(data.accountRef)) {
				return undefined;
			}
			const account = data.accountRef as Record<string, unknown>;
			if (typeof account.selectionId !== 'string' || !account.selectionId.trim()) {
				return undefined;
			}
			accountRef = { selectionId: account.selectionId };
		}
		binding = { source: data.source, ...(accountRef ? { accountRef } : {}) };
	}
	return { id, kind, label, ...(binding ? { binding } : {}) };
}

export function readAgentModelProvider(source: IAgentMetadataSource | undefined): IAgentModelProvider | undefined {
	return parseAgentModelProvider(source?._meta?.[modelProviderKey]);
}

export function hasAgentModelProviderMetadata(source: IAgentMetadataSource | undefined): boolean {
	return hasAgentMetadata(source, [modelProviderKey]);
}

export function toAgentModelProviderMeta(provider: IAgentModelProvider | undefined): Record<string, unknown> | undefined {
	return provider ? { [modelProviderKey]: toModelProviderData(provider) } : undefined;
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
	const provider = parseAgentModelProvider(data.provider);
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
			provider: toModelProviderData(execution.provider),
			modelId: execution.modelId,
			...(execution.modelDisplayName !== undefined ? { modelDisplayName: execution.modelDisplayName } : {}),
		},
	} : undefined;
}

function toModelProviderData(provider: IAgentModelProvider): IAgentModelProvider {
	return {
		id: provider.id, kind: provider.kind, label: provider.label,
		...(provider.binding !== undefined ? {
			binding: {
				source: provider.binding.source,
				...(provider.binding.accountRef !== undefined ? { accountRef: { selectionId: provider.binding.accountRef.selectionId } } : {}),
			},
		} : {}),
	};
}

/** A presentation/aggregation key, never a model selector or an authentication account lookup. */
export function getAgentModelProviderKey(provider: IAgentModelProvider): string {
	return provider.binding
		? JSON.stringify(['binding', provider.id, provider.binding.accountRef?.selectionId])
		: JSON.stringify(['provider', provider.id]);
}

/** Unknown accounts and legacy product references remain separate from captured binding identities. */
export function getAgentModelUsageKey(modelId: string, provider: IAgentModelProvider | undefined): string {
	return JSON.stringify([provider ? getAgentModelProviderKey(provider) : undefined, modelId]);
}
