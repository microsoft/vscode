/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { IAgentMetadataSource } from '../metadata.js';

export const imageGenerationToolMetaKey = 'vscode.imageGeneration';

/** Reported usage for one image operation. Absent billing is unknown, not free. */
export interface IImageGenerationToolUsage {
	readonly requestId: string;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly totalTokens?: number;
	readonly copilotUsage?: { readonly totalNanoAiu: number };
}

/** The image engine requested by this tool, not the conversation model or a claimed serving model. */
export interface IImageGenerationToolMetadata {
	readonly requestedModel: {
		readonly id: string;
		readonly name?: string;
	};
	readonly usage?: IImageGenerationToolUsage;
}

export function parseImageGenerationToolUsage(value: unknown): IImageGenerationToolUsage | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.requestId !== 'string' || !raw.requestId.trim()) {
		return undefined;
	}
	const usage: { -readonly [K in keyof IImageGenerationToolUsage]: IImageGenerationToolUsage[K] } = { requestId: raw.requestId };
	for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
		const count = raw[key];
		if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
			usage[key] = count;
		}
	}
	const billing = isObject(raw.copilotUsage) ? raw.copilotUsage as Record<string, unknown> : undefined;
	const charge = billing?.totalNanoAiu;
	if (typeof charge === 'number' && Number.isFinite(charge) && charge >= 0) {
		usage.copilotUsage = { totalNanoAiu: charge };
	}
	return usage;
}

export function parseImageGenerationToolMetadata(value: unknown): IImageGenerationToolMetadata | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const requestedModel = (value as Record<string, unknown>).requestedModel;
	if (!isObject(requestedModel)) {
		return undefined;
	}
	const model = requestedModel as Record<string, unknown>;
	const id = model.id;
	if (typeof id !== 'string' || !id.trim()) {
		return undefined;
	}
	const name = typeof model.name === 'string' ? model.name.trim() : undefined;
	const usage = parseImageGenerationToolUsage((value as Record<string, unknown>).usage);
	return { requestedModel: { id, ...(name ? { name } : {}) }, ...(usage ? { usage } : {}) };
}

export function readImageGenerationToolMetadata(source: IAgentMetadataSource): IImageGenerationToolMetadata | undefined {
	return parseImageGenerationToolMetadata(source._meta?.[imageGenerationToolMetaKey]);
}
