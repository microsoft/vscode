/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';

const slashCommandResourceKey = 'vscode.slashCommandResource';

export interface ISlashCommandResource {
	readonly resource: URI;
	readonly preview: boolean;
}

/** Reads an optional resource to open for a user-invoked slash command. */
export function readSlashCommandResource(source: { readonly _meta?: Record<string, unknown> }): ISlashCommandResource | undefined {
	const value = source._meta?.[slashCommandResourceKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { resource, preview } = value as Record<string, unknown>;
	if (typeof resource !== 'string' || typeof preview !== 'boolean') {
		return undefined;
	}
	try {
		return { resource: URI.parse(resource, true), preview };
	} catch {
		return undefined;
	}
}

export function toSlashCommandResourceMeta(resource: URI, preview: boolean): Record<string, unknown> {
	return { [slashCommandResourceKey]: { resource: resource.toString(), preview } };
}
