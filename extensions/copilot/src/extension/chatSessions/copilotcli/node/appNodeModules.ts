/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, promises as fs } from 'fs';
import * as path from 'path';

/**
 * Roots under VS Code's app root that may hold its bundled `node_modules`, in
 * priority order.
 *
 * In a packaged build VS Code's `node_modules` is bundled into a
 * `node_modules.asar` archive and any native binaries are extracted alongside it
 * into `node_modules.asar.unpacked`. In development they live in a plain
 * `node_modules`. Consumers that reach into VS Code's own modules for native
 * binaries (ripgrep, node-pty, the MXC sandbox binaries, …) must therefore probe
 * both roots, preferring the plain `node_modules` used in dev and marketplace
 * installs.
 */
export const APP_NODE_MODULES_ROOTS = ['node_modules', 'node_modules.asar.unpacked'] as const;

/**
 * Resolves a path to one of VS Code's bundled module resources, checking both
 * the plain `node_modules` (dev) and `node_modules.asar.unpacked` (packaged)
 * roots. Returns the first existing path, or the plain `node_modules` path when
 * neither exists so callers still get a stable default.
 */
export function resolveAppModulePathSync(appRoot: string, ...segments: string[]): string {
	for (const root of APP_NODE_MODULES_ROOTS) {
		const candidate = path.join(appRoot, root, ...segments);
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return path.join(appRoot, APP_NODE_MODULES_ROOTS[0], ...segments);
}

/**
 * Async variant of {@link resolveAppModulePathSync}.
 */
export async function resolveAppModulePath(appRoot: string, ...segments: string[]): Promise<string> {
	for (const root of APP_NODE_MODULES_ROOTS) {
		const candidate = path.join(appRoot, root, ...segments);
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// Not present under this root; try the next one.
		}
	}
	return path.join(appRoot, APP_NODE_MODULES_ROOTS[0], ...segments);
}
