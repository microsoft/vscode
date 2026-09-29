/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

function parseUrl(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}

function isGitHubHost(url: URL, enterpriseBaseUrl: string | undefined): boolean {
	if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
		return true;
	}

	const enterpriseUrl = enterpriseBaseUrl ? parseUrl(enterpriseBaseUrl) : undefined;
	return enterpriseUrl !== undefined && url.origin === enterpriseUrl.origin;
}

/** Whether a URL identifies an issue or pull request on GitHub.com or the configured GitHub Enterprise host. */
export function isGitHubIssueOrPullRequestUrl(value: string, enterpriseBaseUrl?: string): boolean {
	const url = parseUrl(value);
	if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !isGitHubHost(url, enterpriseBaseUrl)) {
		return false;
	}

	const [, owner, repository, kind, number] = url.pathname.split('/');
	if (!owner || !repository || (kind !== 'issues' && kind !== 'pull') || !number || !/^\d+$/.test(number)) {
		return false;
	}

	const numericNumber = Number(number);
	return Number.isSafeInteger(numericNumber) && numericNumber > 0;
}
