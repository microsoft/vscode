/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';

interface IFinderServiceAddon {
	/** Register a callback to receive file paths when the Finder service is invoked. */
	onOpenFiles(callback: (paths: string[]) => void): void;
	/** Enable or disable the Finder service menu item. */
	setEnabled(enabled: boolean): void;
}

/**
 * Loads the native `@vscode/finder-service` addon.
 *
 * The addon self-registers as `NSApp.servicesProvider` on module load so
 * the service is available in Finder as soon as the module is imported.
 * The returned object exposes:
 *   - `onOpenFiles(cb)` — receive paths when the user invokes the service
 *   - `setEnabled(bool)` — enable/disable the menu item
 *
 * Returns `undefined` on non-macOS or if the addon is unavailable.
 */
export async function loadFinderService(logService: ILogService): Promise<IFinderServiceAddon | undefined> {
	if (!isMacintosh) {
		return undefined;
	}

	try {
		// Dynamic import — the addon is optional and only available in
		// production macOS builds where it has been compiled by node-gyp.
		// The addon self-registers with NSApp.servicesProvider on load.
		const addon = (await import('@vscode/finder-service' + '' /* defeats static analysis */)) as IFinderServiceAddon;
		return addon;
	} catch (error) {
		logService.trace('Finder service addon not available:', error);
		return undefined;
	}
}
