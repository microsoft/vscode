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
		...(link ? { link } : {}),
		...(uri ? { uri } : {}),
		...(artifact.commitHash ? { commitHash: artifact.commitHash } : {}),
		...(artifact.isGitHub !== undefined ? { isGitHub: artifact.isGitHub } : {}),
	};
}

/**
 * GitHub pull request and issue artifacts are promoted into the session's
 * GitHub links (polled and shown in their own pills) instead of the artifacts
 * pill, so the two never show the same reference twice.
 */
export interface ISessionArtifactPartition {
	/** Every artifact in stream order, paired with the link it may be promoted by. */
	readonly entries: readonly ISessionArtifactEntry[];
	/** Pull requests this session created; eligible to become the main pull request. */
	readonly createdPullRequestUrls: readonly string[];
	/** Pull requests the session only referenced; listed and polled, never main. */
	readonly referencedPullRequestUrls: readonly string[];
	readonly issueUrls: readonly string[];
}

/** An artifact, and the GitHub link it is promoted by when it has one. */
export interface ISessionArtifactEntry {
	readonly artifact: ISessionArtifact;
	readonly promotedLink?: string;
}

/** Normalized key for comparing links irrespective of case and trailing slash. */
export function linkKey(link: string): string {
	return link.replace(/\/+$/, '').toLowerCase();
}

/**
 * The artifacts the pill shows: everything except the promoted references that
 * the GitHub pills actually surfaced. A promotion the session cannot surface —
 * no repository, or a reference belonging to another repository — stays an
 * artifact rather than disappearing from both places.
 */
export function getPresentedArtifacts(partition: ISessionArtifactPartition, surfacedLinks: ReadonlySet<string>): readonly ISessionArtifact[] {
	return partition.entries
		.filter(entry => !entry.promotedLink || !surfacedLinks.has(linkKey(entry.promotedLink)))
		.map(entry => entry.artifact);
}

/**
 * Only links the pull request and issue pills can actually render are promoted;
 * anything else (an enterprise host, a malformed link) stays an artifact so it
 * never disappears from both places.
 */
function promotedLink(artifact: IProtocolSessionArtifact): string | undefined {
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
	const createdPullRequestUrls: string[] = [];
	const referencedPullRequestUrls: string[] = [];
	const issueUrls: string[] = [];

	for (const artifact of readSessionArtifacts(meta)) {
		const mapped = toSessionArtifact(artifact);
		if (!mapped) {
			continue;
		}
		const link = promotedLink(artifact);
		entries.push(link ? { artifact: mapped, promotedLink: link } : { artifact: mapped });
		if (!link) {
			continue;
		}

		if (artifact.type === SessionArtifactType.Issue) {
			issueUrls.push(link);
		} else if (artifact.createdByThisSession) {
			createdPullRequestUrls.push(link);
		} else {
			referencedPullRequestUrls.push(link);
		}
	}

	return { entries, createdPullRequestUrls, referencedPullRequestUrls, issueUrls };
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
