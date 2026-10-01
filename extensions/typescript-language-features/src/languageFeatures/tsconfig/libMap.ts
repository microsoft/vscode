/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TypeScriptVersion } from '../../tsServer/versionProvider';

/**
 * TypeScript's `libMap`: a lower-cased `compilerOptions.lib` entry to the lib
 * file it loads. Most entries map to `lib.<entry>.d.ts`, but aliases such as
 * `es7` or `esnext.bigint` map to the file of the edition that shipped the
 * feature, and which entries are aliases changes with every TypeScript release.
 */
export type TsLibMap = ReadonlyMap<string, string>;

/** Reads the lib map of one TypeScript install, or `undefined` when it cannot. */
export type TsLibMapReader = (version: TypeScriptVersion) => Promise<TsLibMap | undefined>;

/** Whether a parsed `libMap.json` has the shape the bundle step writes. */
export function isLibMapEntries(value: unknown): value is [string, string][] {
	return Array.isArray(value)
		&& value.every(entry => Array.isArray(entry) && entry.length === 2 && entry.every(item => typeof item === 'string'));
}
