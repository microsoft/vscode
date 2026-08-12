/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A GitHub issue referenced from a user message. */
export interface IGitHubIssueReference {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

/**
 * Matches `https://github.com/{owner}/{repo}/issues/{number}`, optionally with a
 * `www.` host, a trailing slash, a query string or a fragment (e.g. the
 * `#issuecomment-123` anchor GitHub appends when copying a comment link).
 */
const ISSUE_URL_PATTERN = /\bhttps?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\b/gi;

/**
 * Matches the cross-repository shorthand `{owner}/{repo}#{number}`. The leading
 * boundary check rejects references that are part of a longer path (e.g. the
 * `microsoft/vscode#1` inside a URL, which the URL pattern already covers).
 */
const ISSUE_SHORTHAND_PATTERN = /(?<![\w./-])([\w.-]+)\/([\w.-]+)#(\d+)\b/g;

/** Upper bound on the number of issues tracked per session. */
export const MAX_SESSION_ISSUE_REFERENCES = 10;

/**
 * Extracts the GitHub issues referenced in `text`, in order of first
 * appearance and without duplicates.
 *
 * Only unambiguous references are detected — full issue URLs and the
 * `owner/repo#number` shorthand. Bare `#number` references are deliberately
 * ignored because they cannot be resolved without guessing a repository and
 * are a common source of false positives (headings, code, IDs).
 */
export function parseGitHubIssueReferences(text: string): IGitHubIssueReference[] {
	const references: IGitHubIssueReference[] = [];
	const seen = new Set<string>();

	const add = (owner: string, repo: string, rawNumber: string): void => {
		const number = Number(rawNumber);
		if (!Number.isSafeInteger(number) || number <= 0) {
			return;
		}
		const url = toGitHubIssueUrl({ owner, repo, number });
		if (seen.has(url)) {
			return;
		}
		seen.add(url);
		references.push({ owner, repo, number });
	};

	for (const match of text.matchAll(ISSUE_URL_PATTERN)) {
		add(match[1], match[2], match[3]);
	}
	for (const match of text.matchAll(ISSUE_SHORTHAND_PATTERN)) {
		add(match[1], match[2], match[3]);
	}

	return references;
}

/** Builds the canonical `github.com` URL for an issue reference. */
export function toGitHubIssueUrl(reference: IGitHubIssueReference): string {
	return `https://github.com/${reference.owner}/${reference.repo}/issues/${reference.number}`;
}

/** Parses a canonical GitHub issue URL back into its parts, or `undefined`. */
export function parseGitHubIssueUrl(url: string): IGitHubIssueReference | undefined {
	return parseGitHubIssueReferences(url)[0];
}
