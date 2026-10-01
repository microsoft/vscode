/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';

export const imageGenerationToolMetaKey = 'vscode.imageGeneration';

/** The image engine requested by this tool, not the conversation model or a claimed serving model. */
export interface IImageGenerationToolMetadata {
	readonly requestedModel: {
		readonly id: string;
		readonly name?: string;
	};
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
	return { requestedModel: { id, ...(name ? { name } : {}) } };
}

export function readImageGenerationToolMetadata(source: { readonly _meta?: Record<string, unknown> }): IImageGenerationToolMetadata | undefined {
	return parseImageGenerationToolMetadata(source._meta?.[imageGenerationToolMetaKey]);
}
