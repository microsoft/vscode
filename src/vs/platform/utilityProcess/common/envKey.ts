/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Whether `key` is a name Node.js accepts on process environments.
 *
 * Names beginning with a digit or containing characters other than `[A-Za-z0-9_]`
 * are rejected: forwarding such keys to a forked/spawned child environment makes
 * Electron throw `TypeError: Invalid value for env`, breaking the child process
 * (e.g. the extension host). They must be filtered at the boundary.
 */
export function isValidEnvVariableKey(key: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}