/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserViewAppPolicyDecision, BrowserViewAppPolicyRequestContext, decideBrowserViewAppPolicyNavigation, isExternalLinkTarget, type IBrowserViewAppPolicy } from '../common/browserAppPolicy.js';
import type { UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';

export enum NewPageLocation {
	Foreground = 'foreground',
	Background = 'background',
	NewWindow = 'newWindow'
}

type WindowOpenHandler = Parameters<Electron.WebContents['setWindowOpenHandler']>[0];

/** A confined session cannot supply storage to an unsourced browser child. */
export function assertBrowserViewCanInheritSession(policy: IBrowserViewAppPolicy | undefined, source: UriComponents | undefined): void {
	if (policy && !source) {
		throw new Error(localize('browser.canvasChildUnsupported', "Canvas pages cannot open additional browser tabs. Open the canvas through its owning chat instead."));
	}
}

export function createBrowserViewWindowOpenHandler(
	getAppPolicy: () => IBrowserViewAppPolicy | undefined,
	consumePopupPermission: (location: NewPageLocation) => boolean,
	openExternal: (url: string) => void,
	createWindow: (location: NewPageLocation, url: string, options: Electron.BrowserWindowConstructorOptions) => Electron.WebContents,
): WindowOpenHandler {
	return details => {
		const policy = getAppPolicy();
		if (policy && decideBrowserViewAppPolicyNavigation(policy, details.url, BrowserViewAppPolicyRequestContext.Popup) !== BrowserViewAppPolicyDecision.Allow) {
			if (isExternalLinkTarget(policy, details.url) && consumePopupPermission(NewPageLocation.NewWindow)) {
				openExternal(details.url);
			}
			return { action: 'deny' };
		}

		const location = (() => {
			switch (details.disposition) {
				case 'background-tab': return NewPageLocation.Background;
				case 'foreground-tab': return NewPageLocation.Foreground;
				case 'new-window': return NewPageLocation.NewWindow;
				default: return undefined;
			}
		})();
		if (!location || !consumePopupPermission(location)) {
			return { action: 'deny' };
		}
		return {
			action: 'allow',
			createWindow: options => createWindow(location, details.url, options),
			outlivesOpener: true,
		};
	};
}
