/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';

interface IFinderServiceAddon {
	init(callback: (paths: string[]) => void): void;
}

/**
 * Tries to load the native `@vscode/finder-service` addon and initialize it.
 *
 * The addon registers as `NSApp.servicesProvider` so that "Open with {app}"
 * appears in Finder's context menu. When the service is invoked, the callback
 * receives an array of file paths.
 *
 * No-op on non-macOS platforms or when the addon is not available.
 */
export async function initFinderService(callback: (paths: string[]) => void, logService: ILogService): Promise<void> {
	if (!isMacintosh) {
		return;
	}

	try {
		// Dynamic import — the addon is optional and only available in
		// production macOS builds where it has been compiled by node-gyp.
		const addon: IFinderServiceAddon = (await import('@vscode/finder-service' + '' /* defeats static analysis */)) as IFinderServiceAddon;
		addon.init(callback);
	} catch (error) {
		logService.trace('Finder service addon not available:', error);
	}
}
