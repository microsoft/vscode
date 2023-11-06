/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { env } from 'vs/base/common/process';

export function isHotReloadEnabled(): boolean {
	return !!env['VSCODE_DEV'];
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
export type HotReloadHandler = (oldExports: Record<string, unknown>) => AcceptNewExportsHandler | undefined;
export type AcceptNewExportsHandler = (newExports: Record<string, unknown>) => boolean;

function registerGlobalHotReloadHandler() {
	if (!hotReloadHandlers) {
		hotReloadHandlers = new Set();
	}

	const g = globalThis as unknown as GlobalThisAddition;
	if (!g.$hotReload_applyNewExports) {
		g.$hotReload_applyNewExports = oldExports => {
			for (const h of hotReloadHandlers!) {
				const result = h(oldExports);
				if (result) { return result; }
			}
			return undefined;
		};
	}

	return hotReloadHandlers;
}

let hotReloadHandlers: Set<(oldExports: Record<string, unknown>) => AcceptNewExportsFn | undefined> | undefined = undefined;

interface GlobalThisAddition {
	$hotReload_applyNewExports?(oldExports: Record<string, unknown>): AcceptNewExportsFn | undefined;
}

type AcceptNewExportsFn = (newExports: Record<string, unknown>) => boolean;
