/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const urlCandidatePattern = /(?:^|[^a-z0-9@._/-])(?<candidate>(?:https?:\/\/)?[a-z0-9][^\s<>{}\[\]()"',;`]*\.[^\s<>{}\[\]()"',;`]*)/giu;
const knownConnectorDomains: Readonly<Record<string, readonly string[]>> = {
	atlassian: ['atlassian.net'],
	'atlassian-rovo': ['atlassian.net'],
	cloudflare: ['cloudflare.com'],
	kusto: ['dataexplorer.azure.com', 'kusto.windows.net'],
	linear: ['linear.app'],
	microsoftlearndocsmcpserver: ['learn.microsoft.com'],
	notion: ['notion.so', 'notion.site'],
	sentry: ['sentry.io'],
	workiq: ['microsoft365.com', 'office.com', 'outlook.office.com', 'outlook.office365.com', 'sharepoint.com', 'teams.microsoft.com'],
	'workiq-mail': ['microsoft365.com', 'office.com', 'outlook.office.com', 'outlook.office365.com', 'sharepoint.com', 'teams.microsoft.com'],
};

export function findMatchingConnectorRecommendationIds(
	input: string,
	recommendationIds: Iterable<string> | undefined,
): ReadonlySet<string> {
	if (!input || !recommendationIds) {
		return new Set();
	}

	const hostnames = extractUrlHostnames(input);
	if (hostnames.size === 0) {
		return new Set();
	}

	const matches = new Set<string>();
	for (const id of recommendationIds) {
		const domains = knownConnectorDomains[id] ?? [];
		if (domains.some(domain => [...hostnames].some(hostname => hostname === domain || hostname.endsWith(`.${domain}`)))) {
			matches.add(id);
		}
	}
	return matches;
}

function extractUrlHostnames(input: string): ReadonlySet<string> {
	const hostnames = new Set<string>();
	for (const match of input.matchAll(urlCandidatePattern)) {
		const candidate = match.groups?.candidate;
		if (!candidate || !candidate.includes('://') && candidate.includes('@')) {
			continue;
		}
		try {
			const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
			if (url.protocol === 'http:' || url.protocol === 'https:') {
				hostnames.add(url.hostname.toLowerCase().replace(/\.$/, ''));
			}
		} catch {
			// Ignore malformed URL-like text while the user is composing.
		}
	}
	return hostnames;
}
