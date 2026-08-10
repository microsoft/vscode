/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A GitHub pull request referenced from a user message. */
export interface IGitHubPullRequestReference {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

const PULL_REQUEST_URL_PATTERN = /\bhttps?:\/\/(?:www\.)?github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)\b/gi;
const PULL_REQUEST_SHORTHAND_PATTERN = /\b(?:PR|pull request)\s*#(?<number>\d+)\b/gi;

/** Extracts unambiguous GitHub pull request references without duplicates. */
export function parseGitHubPullRequestReferences(text: string, defaultRepository?: { readonly owner: string; readonly repo: string }): IGitHubPullRequestReference[] {
	const candidates: (IGitHubPullRequestReference & { readonly index: number })[] = [];
	const references: IGitHubPullRequestReference[] = [];
	const seen = new Set<string>();

	const addCandidate = (index: number, owner: string, repo: string, rawNumber: string): void => {
		const number = Number(rawNumber);
		if (!Number.isSafeInteger(number) || number <= 0) {
			return;
		}
		candidates.push({ index, owner, repo, number });
	};

	for (const match of text.matchAll(PULL_REQUEST_URL_PATTERN)) {
		if (match.groups) {
			addCandidate(match.index, match.groups.owner, match.groups.repo, match.groups.number);
		}
	}
	if (defaultRepository) {
		for (const match of text.matchAll(PULL_REQUEST_SHORTHAND_PATTERN)) {
			if (match.groups) {
				addCandidate(match.index, defaultRepository.owner, defaultRepository.repo, match.groups.number);
			}
		}
	}

	for (const candidate of candidates.sort((a, b) => a.index - b.index)) {
		const { owner, repo, number } = candidate;
		const reference = { owner, repo, number };
		const url = toGitHubPullRequestUrl(reference).toLowerCase();
		if (!seen.has(url)) {
			seen.add(url);
			references.push(reference);
		}
	}

	return references;
}

/** Builds the canonical `github.com` URL for a pull request reference. */
export function toGitHubPullRequestUrl(reference: IGitHubPullRequestReference): string {
	return `https://github.com/${reference.owner}/${reference.repo}/pull/${reference.number}`;
}
