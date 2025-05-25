/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from './lifecycle.js';
import { env } from './process.js';

export function isHotReloadEnabled(): boolean {
	return env && !!env['VSCODE_DEV_DEBUG'];
}
export function registerHotReloadHandler(handler: HotReloadHandler): IDisposable {
	if (!isHotReloadEnabled()) {
		return { dispose() { } };
	} else {
		const handlers = registerGlobalHotReloadHandler();
		handlers.add(handler);
		return {
			dispose() { handlers.delete(handler); }
		};
	}
}

/**
 * Takes the old exports of the module to reload and returns a function to apply the new exports.
 * If `undefined` is returned, this handler is not able to handle the module.
 *
 * If no handler can apply the new exports, the module will not be reloaded.
 */
export type HotReloadHandler = (args: { oldExports: Record<string, unknown>; newSrc: string; config: IHotReloadConfig }) => AcceptNewExportsHandler | undefined;
export type AcceptNewExportsHandler = (newExports: Record<string, unknown>) => boolean;
export type IHotReloadConfig = HotReloadConfig;

function registerGlobalHotReloadHandler() {
	if (!hotReloadHandlers) {
		hotReloadHandlers = new Set();
	}

	const g = globalThis as unknown as GlobalThisAddition;
	if (!g.$hotReload_applyNewExports) {
		g.$hotReload_applyNewExports = args => {
			const args2 = { config: { mode: undefined }, ...args };

			const results: AcceptNewExportsHandler[] = [];
			for (const h of hotReloadHandlers!) {
				const result = h(args2);
				if (result) {
					results.push(result);
				}
			}
			if (results.length > 0) {
				return newExports => {
					let result = false;
					for (const r of results) {
						if (r(newExports)) {
							result = true;
						}
					}
					return result;
				};
			}
			return undefined;
		};
	}

	return hotReloadHandlers;
}

let hotReloadHandlers: Set<(args: { oldExports: Record<string, unknown>; newSrc: string; config: HotReloadConfig }) => AcceptNewExportsFn | undefined> | undefined = undefined;

interface HotReloadConfig {
	mode?: 'patch-prototype' | undefined;
}

interface GlobalThisAddition {
	$hotReload_applyNewExports?(args: { oldExports: Record<string, unknown>; newSrc: string; config?: HotReloadConfig }): AcceptNewExportsFn | undefined;
}

type AcceptNewExportsFn = (newExports: Record<string, unknown>) => boolean;

if (isHotReloadEnabled()) {
	// This code does not run in production.
	registerHotReloadHandler(({ oldExports, newSrc, config }) => {
		if (config.mode !== 'patch-prototype') {
			return undefined;
		}

		return newExports => {
			for (const key in newExports) {
				const exportedItem = newExports[key];
				console.log(`[hot-reload] Patching prototype methods of '${key}'`, { exportedItem });
				if (typeof exportedItem === 'function' && exportedItem.prototype) {
					const oldExportedItem = oldExports[key];
					if (oldExportedItem) {
						for (const prop of Object.getOwnPropertyNames(exportedItem.prototype)) {
							const descriptor = Object.getOwnPropertyDescriptor(exportedItem.prototype, prop)!;
							const oldDescriptor = Object.getOwnPropertyDescriptor((oldExportedItem as any).prototype, prop);

							if (descriptor?.value?.toString() !== oldDescriptor?.value?.toString()) {
								console.log(`[hot-reload] Patching prototype method '${key}.${prop}'`);
							}

							Object.defineProperty((oldExportedItem as any).prototype, prop, descriptor);
						}
						newExports[key] = oldExportedItem;
					}
				}
			}
			return true;
		};
	});
}
