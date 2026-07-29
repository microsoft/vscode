/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Placeholder substituted for the recording machine's OS account name. */
export const USER_NAME_PLACEHOLDER = '${user}';

/**
 * `ls -l` prefix up to and including the owner and group columns.
 *
 * Group 1 is everything through the link count, group 2 the owner, group 3 the
 * gap, group 4 the group. Anchored per line so it only matches a real listing.
 */
const LISTING_OWNER_RE = /^([dlcbps-][rwxStTs-]{9}[+@.]?\s+\d+\s+)(\S+)(\s+)(\S+)/gm;
const PATH_SEGMENT_END = '(?=$|[/\\\\\\s"\'`,:;!?#)\\]}>])';

/**
 * Replaces the recording machine's account name where it identifies a *user*,
 * leaving prose alone.
 *
 * Two things make this necessary. Committed fixtures must not carry the
 * recorder's local identity, and the account name differs per environment — a
 * developer's own name locally, `runner` on GitHub Actions Linux,
 * `runneradmin` on Windows — so an un-normalized name also makes the same
 * recording fail to replay elsewhere.
 *
 * A blanket `replaceAll(userName, …)` handles both, but it is an unanchored
 * substring replace: with the account name `runner`, the tool output
 * `the runner completed` becomes `the ${user} completed`. That corrupts
 * captured text and, worse, does so only on the platforms whose account name
 * happens to be an ordinary word — exactly the cross-platform mismatch the
 * normalization exists to prevent.
 *
 * Only the two positions where the name genuinely identifies a user are
 * rewritten:
 *
 * - after a path separator (`/home/runner/x`, `C:\Users\runner\x`), including
 *   the escaped `\\` form that appears inside embedded JSON;
 * - the owner and group columns of an `ls -l` listing, which is where the name
 *   shows up outside a path.
 */
export function scrubUserName(text: string, userName: string): string {
	if (!userName) {
		return text;
	}
	const escaped = escapeRegExpCharacters(userName);
	return text
		.replace(new RegExp(`(?<=[/\\\\])${escaped}${PATH_SEGMENT_END}`, 'g'), USER_NAME_PLACEHOLDER)
		.replace(LISTING_OWNER_RE, (match, prefix: string, owner: string, gap: string, group: string) => {
			if (owner !== userName && group !== userName) {
				return match;
			}
			const scrubbedOwner = owner === userName ? USER_NAME_PLACEHOLDER : owner;
			const scrubbedGroup = group === userName ? USER_NAME_PLACEHOLDER : group;
			return `${prefix}${scrubbedOwner}${gap}${scrubbedGroup}`;
		});
}
