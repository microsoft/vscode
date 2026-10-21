/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function findMatchingConnectorRecommendationIds(
	input: string,
	recommendationUrls: ReadonlyMap<string, readonly string[]> | undefined,
): ReadonlySet<string> {
	if (!input || !recommendationUrls) {
		return new Set();
	}

	const hostnames = extractUrlHostnames(input);
	if (hostnames.size === 0) {
		return new Set();
	}

	const matches = new Set<string>();
	for (const [id, domains] of recommendationUrls) {
		if (domains.some(domain => {
			const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
			return normalizedDomain.length > 0
				&& [...hostnames].some(hostname => hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`));
		})) {
			matches.add(id);
		}
	}
	return matches;
}

function extractUrlHostnames(input: string): ReadonlySet<string> {
	const hostnames = new Set<string>();
	let tokenStart = 0;
	for (let index = 0; index <= input.length; index++) {
		if (index < input.length && input.charCodeAt(index) > 32) {
			continue;
		}
		if (index > tokenStart) {
			const hostname = extractUrlHostname(input.slice(tokenStart, index));
			if (hostname) {
				hostnames.add(hostname);
			}
		}
		tokenStart = index + 1;
	}
	return hostnames;
}

function extractUrlHostname(token: string): string | undefined {
	const lowercaseToken = token.toLowerCase();
	const httpIndex = lowercaseToken.indexOf('http://');
	const httpsIndex = lowercaseToken.indexOf('https://');
	const protocolIndex = httpIndex < 0 ? httpsIndex : httpsIndex < 0 ? httpIndex : Math.min(httpIndex, httpsIndex);
	let candidate: string;
	if (protocolIndex >= 0) {
		candidate = token.slice(protocolIndex);
	} else {
		const markdownDestinationIndex = token.lastIndexOf('](');
		let candidateStart = markdownDestinationIndex >= 0 ? markdownDestinationIndex + 2 : 0;
		while (candidateStart < token.length && !isAsciiAlphaNumeric(token.charCodeAt(candidateStart))) {
			candidateStart++;
		}
		candidate = token.slice(candidateStart);
		if (!candidate.includes('.') || candidate.includes('@')) {
			return undefined;
		}
	}

	candidate = trimTrailingUrlPunctuation(candidate);
	try {
		const url = new URL(protocolIndex >= 0 ? candidate : `https://${candidate}`);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return url.hostname.toLowerCase().replace(/\.$/, '');
		}
	} catch {
		// Ignore malformed URL-like text while the user is composing.
	}
	return undefined;
}

function trimTrailingUrlPunctuation(candidate: string): string {
	let end = candidate.length;
	while (end > 0 && '.,;:!?)]}>\'"`'.includes(candidate[end - 1])) {
		end--;
	}
	return candidate.slice(0, end);
}

function isAsciiAlphaNumeric(charCode: number): boolean {
	return charCode >= 48 && charCode <= 57
		|| charCode >= 65 && charCode <= 90
		|| charCode >= 97 && charCode <= 122;
}
