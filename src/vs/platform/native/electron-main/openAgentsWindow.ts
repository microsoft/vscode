/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IOpenConfiguration, IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IOpenAgentsWindowOptions } from '../common/native.js';

export async function openAgentsWindow(windowsMainService: IWindowsMainService, openConfig: IOpenConfiguration, options?: IOpenAgentsWindowOptions): Promise<void> {
	const windows = await windowsMainService.openAgentsWindow(
		openConfig,
		options?.folderUri ? URI.revive(options.folderUri) : undefined,
		options?.sessionResource ? URI.revive(options.sessionResource) : undefined,
		options?.source,
		options?.folderUriIsDefault,
	);
	if (windows.length > 0) {
		windows[0].focus();
	}
	if (options?.tryoutId !== undefined) {
		if (windows.length !== 1) {
			throw new Error(localize('onboardingTryout.noAgentsWindow', "The feature example could not be sent to an Agents window."));
		}
		// Use the same one-shot delivery for initial and reused windows, rather than reloadable window configuration.
		windows[0].sendWhenReady('vscode:runOnboardingTryout', CancellationToken.None, options.tryoutId);
	}
}
