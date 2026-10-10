/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal browser process shim for the Dev Tunnels dependency graph.
 */
export const process = {
	env: Object.create(null),
	nextTick(callback, ...args) {
		queueMicrotask(() => callback(...args));
	},
};
