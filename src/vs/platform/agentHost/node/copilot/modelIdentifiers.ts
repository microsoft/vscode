/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const GPT_56_MODEL_IDS: ReadonlySet<string> = new Set([
	'gpt-5.6-sol',
	'gpt-5.6-terra',
	'gpt-5.6-luna',
]);

export function isGpt56Model(modelId: string | undefined): boolean {
	return modelId !== undefined && GPT_56_MODEL_IDS.has(modelId.toLowerCase());
}
