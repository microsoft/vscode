/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { extractDomainFromUri, matchesDomainPolicyPattern } from '../../../../platform/networkFilter/common/domainMatcher.js';

export const BrowserChatToolsAllowedDomainsSettingId = 'workbench.browser.chatTools.allowedDomains';

/**
 * When {@link allowedDomains} is empty, all URLs pass. Otherwise only URLs whose host
 * matches at least one pattern pass. File URLs and URIs without an authority always pass
 * (aligned with {@link IAgentNetworkFilterService.isUriAllowed}).
 *
 * Does not apply to the fetch tool or other network capabilities — browser chat tools only.
 */
export function isAllowedDomain(url: string, allowedDomains: readonly string[]): boolean {
	if (allowedDomains.length === 0) {
		return true;
	}

	let uri: URI;
	try {
		uri = URI.parse(url);
	} catch {
		return false;
	}

	if (uri.scheme === 'file' || !uri.authority) {
		return true;
	}

	const domain = extractDomainFromUri(uri);
	if (!domain) {
		return true;
	}

	return allowedDomains.some(pattern => matchesDomainPolicyPattern(domain, pattern));
}
