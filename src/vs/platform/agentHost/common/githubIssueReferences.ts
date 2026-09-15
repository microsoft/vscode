/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A GitHub issue, identified by the repository that owns it and its number. */
export interface IGitHubIssueReference {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

/**
 * Matches `https://github.com/{owner}/{repo}/issues/{number}` from the start of
 * the string, optionally with a `www.` host. The trailing boundary lets a URL
 * keep a trailing slash, query string or fragment (e.g. the `#issuecomment-123`
 * anchor GitHub appends when copying a comment link).
 */
const ISSUE_URL_PATTERN = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\b/i;

/** Parses a GitHub issue URL into its parts, or `undefined` when it is not one. */
export function parseGitHubIssueUrl(url: string): IGitHubIssueReference | undefined {
	const match = ISSUE_URL_PATTERN.exec(url);
	if (!match) {
		return undefined;
	}
	const number = Number(match[3]);
	return Number.isSafeInteger(number) && number > 0 ? { owner: match[1], repo: match[2], number } : undefined;
}
