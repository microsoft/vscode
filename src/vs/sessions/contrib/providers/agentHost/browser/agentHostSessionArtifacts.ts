/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { parseGitHubIssueUrl } from '../../../../../platform/agentHost/common/githubIssueReferences.js';
import { readSessionArtifacts, SessionArtifactType, type ISessionArtifact as IProtocolSessionArtifact } from '../../../../../platform/agentHost/common/sessionArtifacts.js';
import type { SessionMeta } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionArtifactKind, type ISessionArtifact } from '../../../../services/sessions/common/session.js';
import { parseGitHubPullRequestUrl } from '../../../github/common/utils.js';

const kindByType: ReadonlyMap<SessionArtifactType, SessionArtifactKind> = new Map([
	[SessionArtifactType.PullRequest, SessionArtifactKind.PullRequest],
	[SessionArtifactType.Issue, SessionArtifactKind.Issue],
	[SessionArtifactType.Commit, SessionArtifactKind.Commit],
	[SessionArtifactType.Website, SessionArtifactKind.Website],
	[SessionArtifactType.File, SessionArtifactKind.File],
	[SessionArtifactType.Resource, SessionArtifactKind.Resource],
]);

function parseUri(value: string | undefined): URI | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return URI.parse(value, true);
	} catch {
		return undefined;
	}
}

function toSessionArtifact(artifact: IProtocolSessionArtifact): ISessionArtifact | undefined {
	const kind = kindByType.get(artifact.type);
	if (!kind) {
		return undefined;
	}

	const link = parseUri(artifact.link);
	const uri = parseUri(artifact.uri);
	// An artifact the client cannot act on is not worth surfacing.
	if (!link && !uri && !artifact.commitHash) {
		return undefined;
	}

	return {
		id: artifact.id,
		kind,
		label: artifact.label,
		isArtifact: artifact.isArtifact,
		...(link ? { link } : {}),
		...(uri ? { uri } : {}),
		...(artifact.commitHash ? { commitHash: artifact.commitHash } : {}),
		...(artifact.isGitHub !== undefined ? { isGitHub: artifact.isGitHub } : {}),
	};
}

/**
 * GitHub pull request and issue artifacts are promoted into the session's
 * GitHub links (polled and shown in their own pills) instead of the artifacts
 * pill, so the two never show the same link twice. References are never
 * promoted: they belong to the references pill, which is where the user looks
 * for what the session pointed at rather than produced.
 */
export interface ISessionArtifactPartition {
	/** Every entry in stream order, paired with the GitHub link that identifies it. */
	readonly entries: readonly ISessionArtifactEntry[];
	/** Pull requests this session produced; polled and shown in the pull request pill. */
	readonly pullRequestUrls: readonly string[];
	/**
	 * Titles the agent recorded for its pull request artifacts, keyed by
	 * {@link linkKey}. Pull requests discovered from git state have no entry.
	 */
	readonly pullRequestTitles: ReadonlyMap<string, string>;
	readonly issueUrls: readonly string[];
}

/** An entry, and the GitHub link that identifies it when it has one. */
export interface ISessionArtifactEntry {
	readonly artifact: ISessionArtifact;
	/**
	 * The GitHub pull request or issue link this entry stands for. Set for
	 * references too, so an entry can be recognized as one the GitHub pills
	 * already surface even though only artifacts are promoted into them.
	 */
	readonly gitHubLink?: string;
}

/** Normalized key for comparing links irrespective of case and trailing slash. */
export function linkKey(link: string): string {
	return link.replace(/\/+$/, '').toLowerCase();
}

/**
 * The artifacts and references the pills show: everything except the entries
 * the GitHub pills actually surfaced. A link the session cannot surface — no
 * repository, or one belonging to another repository — stays here rather than
 * disappearing from both places.
 */
export function getPresentedArtifacts(partition: ISessionArtifactPartition, surfacedLinks: ReadonlySet<string>): readonly ISessionArtifact[] {
	return partition.entries
		.filter(entry => !entry.gitHubLink || !surfacedLinks.has(linkKey(entry.gitHubLink)))
		.map(entry => entry.artifact);
}

/**
 * The GitHub link an entry stands for, when the pull request and issue pills
 * could actually render it. Anything else (an enterprise host, a malformed
 * link) has no link identity and simply stays in its pill.
 */
function gitHubLink(artifact: IProtocolSessionArtifact): string | undefined {
	if (artifact.isGitHub !== true || !artifact.link) {
		return undefined;
	}
	if (artifact.type === SessionArtifactType.PullRequest) {
		return parseGitHubPullRequestUrl(artifact.link) ? artifact.link : undefined;
	}
	if (artifact.type === SessionArtifactType.Issue) {
		return parseGitHubIssueUrl(artifact.link) ? artifact.link : undefined;
	}
	return undefined;
}

export function partitionSessionArtifacts(meta: SessionMeta | undefined): ISessionArtifactPartition {
	const entries: ISessionArtifactEntry[] = [];
	const pullRequestUrls: string[] = [];
	const pullRequestTitles = new Map<string, string>();
	const issueUrls: string[] = [];

	for (const artifact of readSessionArtifacts(meta)) {
		const mapped = toSessionArtifact(artifact);
		if (!mapped) {
			continue;
		}
		const link = gitHubLink(artifact);
		entries.push(link ? { artifact: mapped, gitHubLink: link } : { artifact: mapped });
		// Only what the session produced is promoted into the GitHub pills; a
		// reference keeps its link identity but is never polled.
		if (!link || !artifact.isArtifact) {
			continue;
		}

		if (artifact.type === SessionArtifactType.Issue) {
			issueUrls.push(link);
			continue;
		}

		// The label an agent records for a pull request is its title; keep the
		// first one so a later duplicate cannot rewrite it.
		const key = linkKey(link);
		if (mapped.label && !pullRequestTitles.has(key)) {
			pullRequestTitles.set(key, mapped.label);
		}
		pullRequestUrls.push(link);
	}

	return { entries, pullRequestUrls, pullRequestTitles, issueUrls };
}

/** Case-insensitive de-duplication that keeps the first occurrence's casing. */
export function dedupeLinks(...groups: readonly (readonly string[] | undefined)[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const group of groups) {
		for (const link of group ?? []) {
			const key = link.replace(/\/+$/, '').toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(link);
			}
		}
	}
	return result;
}
