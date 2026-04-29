/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as PixiNS from 'pixi.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { FileAccess, type AppResourcePath } from '../../../../base/common/network.js';

/**
 * Pixi.js ships an IIFE bundle (`dist/pixi.js`) that assigns the library to a
 * global `PIXI` variable. We load it once, lazily, via a classic `<script>`
 * tag (pixi is not an AMD/UMD module so the regular AMD loader cannot consume
 * it) and cache the resulting namespace.
 */

let pixiPromise: Promise<typeof PixiNS> | undefined;

const PIXI_SCRIPT_PATH: AppResourcePath = 'node_modules/pixi.js/dist/pixi.js';

interface IPixiGlobalHost {
	PIXI?: typeof PixiNS;
}

/**
 * Load the pixi.js library at runtime. Subsequent calls return the cached
 * namespace immediately.
 */
export function loadPixi(): Promise<typeof PixiNS> {
	if (pixiPromise) {
		return pixiPromise;
	}
	const host = mainWindow as unknown as IPixiGlobalHost;
	if (host.PIXI) {
		pixiPromise = Promise.resolve(host.PIXI);
		return pixiPromise;
	}
	pixiPromise = new Promise<typeof PixiNS>((resolve, reject) => {
		const scriptElement = mainWindow.document.createElement('script');
		scriptElement.async = true;
		scriptElement.type = 'text/javascript';
		const url = FileAccess.asBrowserUri(PIXI_SCRIPT_PATH).toString(true);
		// Trusted Types: prefer the shared `_VSCODE_WEB_PACKAGE_TTP` policy
		// (registered by the bootstrap), falling back to a dedicated
		// `pixiLoader` policy that is allow-listed in the sessions HTML CSP.
		const policy = globalThis._VSCODE_WEB_PACKAGE_TTP
			?? mainWindow.trustedTypes?.createPolicy('pixiLoader', { createScriptURL(value: string) { return value; } });
		scriptElement.src = (policy?.createScriptURL(url) ?? url) as string;
		scriptElement.addEventListener('load', () => {
			const pixi = host.PIXI;
			if (pixi) {
				resolve(pixi);
			} else {
				reject(new Error('pixi.js loaded but did not register the PIXI global'));
			}
		});
		scriptElement.addEventListener('error', err => reject(err));
		mainWindow.document.head.appendChild(scriptElement);
	});
	return pixiPromise;
}
