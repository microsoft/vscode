/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAgentMetadataSource {
	readonly _meta?: Record<string, unknown>;
}

/** Presence selects a convention before its values are validated. */
export function hasAgentMetadata(source: IAgentMetadataSource | undefined, keys: readonly string[]): boolean {
	const meta = source?._meta;
	return !!meta && keys.some(key => Object.hasOwn(meta, key));
}
