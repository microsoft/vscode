/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAllInterfacesAuthority, isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';

export const enum BrowserLinkOpenerSettingKey {
	OpenLocalhostLinks = 'workbench.browser.openLocalhostLinks',
	OpenExternalLinks = 'workbench.browser.openExternalLinks',
}

/**
 * Returns the matching Integrated Browser opener setting key for an HTTP(S) link.
 * Returns `undefined` when the href is invalid or non-HTTP(S).
 */
export function getIntegratedBrowserLinkOpenerSetting(
	href: string
): BrowserLinkOpenerSettingKey | undefined {
	try {
		const parsed = new URL(href);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return undefined;
		}

		const isLocal = isLocalhostAuthority(parsed.host) || isAllInterfacesAuthority(parsed.host);
		if (isLocal) {
			return BrowserLinkOpenerSettingKey.OpenLocalhostLinks;
		}

		return BrowserLinkOpenerSettingKey.OpenExternalLinks;
	} catch {
		return undefined;
	}
}
