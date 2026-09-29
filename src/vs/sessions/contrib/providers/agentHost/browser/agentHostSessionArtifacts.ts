/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { readSessionArtifacts, SessionArtifactType, type ISessionArtifact as IProtocolSessionArtifact } from '../../../../../platform/agentHost/common/sessionArtifacts.js';
import type { SessionMeta } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { linkKey } from '../../../../common/sessionLinks.js';
import { SessionArtifactKind, type ISessionArtifact } from '../../../../services/sessions/common/session.js';
import { parseGitHubArtifactLink } from '../../../github/common/sessionGitHubReferences.js';

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

function toSessionArtifact(artifact: IProtocolSessionArtifact, mapFileUri: (uri: URI) => URI): ISessionArtifact | undefined {
	const kind = kindByType.get(artifact.type);
	if (!kind) {
		return undefined;
	}

	const link = parseUri(artifact.link);
	const parsedUri = parseUri(artifact.uri);
	const uri = parsedUri && artifact.type === SessionArtifactType.File ? mapFileUri(parsedUri) : parsedUri;
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
 * A GitHub link that was explicitly recorded on the session, so it always
 * carries the stable id needed to remove that record. Git-/session-discovered
 * associations are never recorded and so are not represented by this type.
 */
export interface IRecordedGitHubReference {
	readonly url: string;
	readonly title?: string;
	/** Stable id of the recorded session artifact or reference, used for removal. */
	readonly recordedReferenceId: string;
	/**
	 * Whether the recorded entry is a durable artifact (`true`) or a mere
	 * reference (`false`). Distinguishes a recorded pull request from one the
	 * session actually produced, independent of whether it can be removed.
	 */
	readonly isArtifact: boolean;
}

/** All recorded entries, alongside the GitHub entries eligible for promotion into dedicated pills. */
export interface ISessionArtifactPartition {
	/** Every mapped artifact and reference, most recent first. */
	readonly entries: readonly ISessionArtifactEntry[];
	/** Recorded pull requests, most recent first; polled and shown in the pull request pill. */
	readonly pullRequests: readonly IRecordedGitHubReference[];
	/** Recorded issues, most recent first; polled and shown in the issue pill. */
	readonly issues: readonly IRecordedGitHubReference[];
}

interface ISessionArtifactEntry {
	readonly artifact: ISessionArtifact;
}

export function partitionSessionArtifacts(meta: SessionMeta | undefined, mapFileUri: (uri: URI) => URI = uri => uri): ISessionArtifactPartition {
	const entries: ISessionArtifactEntry[] = [];
	const pullRequests: IRecordedGitHubReference[] = [];
	const issues: IRecordedGitHubReference[] = [];

	for (const artifact of readSessionArtifacts(meta)) {
		const mapped = toSessionArtifact(artifact, mapFileUri);
		if (!mapped) {
			continue;
		}
		entries.push({ artifact: mapped });
		const link = artifact.link;
		if (!link || !parseGitHubArtifactLink(mapped)) {
			continue;
		}

		// Every entry here came from an explicit add_artifact_or_reference call, so
		// both artifacts and references carry their stable id for removal — only
		// git-/session-discovered associations (never recorded) go without one.
		const reference = {
			url: link,
			...(mapped.label ? { title: mapped.label } : {}),
			recordedReferenceId: artifact.id,
			isArtifact: artifact.isArtifact,
		};
		if (artifact.type === SessionArtifactType.Issue) {
			issues.push(reference);
			continue;
		}

		pullRequests.push(reference);
	}

	entries.reverse();
	pullRequests.reverse();
	issues.reverse();

	return { entries, pullRequests, issues };
}

/** Case-insensitive de-duplication that keeps the first occurrence's casing. */
export function dedupeLinks(...groups: readonly (readonly string[] | undefined)[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const group of groups) {
		for (const link of group ?? []) {
			const key = linkKey(link);
			if (!seen.has(key)) {
				seen.add(key);
				result.push(link);
			}
		}
	}
	return result;
}
