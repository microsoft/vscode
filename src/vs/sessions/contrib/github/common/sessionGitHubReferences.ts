/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { parseGitHubIssueUrl } from '../../../../platform/agentHost/common/githubIssueReferences.js';
import { linkKey } from '../../../common/sessionLinks.js';
import { getGitHubPullRequestRefs, IGitHubIssueRef, IGitHubPullRequestRef, ISession, ISessionArtifact, SessionArtifactKind } from '../../../services/sessions/common/session.js';
import { parseGitHubPullRequestUrl } from './utils.js';

export interface ISessionGitHubReferences {
	readonly pullRequests: readonly IGitHubPullRequestRef[];
	readonly issues: readonly IGitHubIssueRef[];
}

/** Recognizes recorded links supported by the dedicated GitHub surfaces. */
export function parseGitHubArtifactLink(artifact: ISessionArtifact): Pick<IGitHubIssueRef, 'owner' | 'repo' | 'number'> | undefined {
	if (artifact.isGitHub !== true || !artifact.link) {
		return undefined;
	}
	const link = artifact.link.toString(true);
	if (artifact.kind === SessionArtifactKind.PullRequest) {
		// URI serialization lowercases hosts, but PR promotion requires the canonical spelling.
		return artifact.link.authority === 'github.com' ? parseGitHubPullRequestUrl(link) : undefined;
	}
	return artifact.kind === SessionArtifactKind.Issue ? parseGitHubIssueUrl(link) : undefined;
}

function mergeGitHubReferences<T extends IGitHubIssueRef>(recorded: readonly T[], associated: readonly T[], merge: (recorded: T, associated: T) => T): readonly T[] {
	const recordedLinks = new Set(recorded.map(ref => linkKey(ref.uri.toString())));
	return [
		...recorded.map(ref => {
			const match = associated.find(candidate => candidate.recordedReferenceId === ref.recordedReferenceId)
				?? associated.find(candidate => !candidate.recordedReferenceId && linkKey(candidate.uri.toString()) === linkKey(ref.uri.toString()));
			return match ? merge(ref, match) : ref;
		}),
		...associated.filter(ref => !recordedLinks.has(linkKey(ref.uri.toString()))),
	];
}

/** Resolves recorded GitHub links independently of a workspace, retaining repository-discovered associations. */
export function getSessionGitHubReferences(session: ISession | undefined, reader: IReader | undefined): ISessionGitHubReferences {
	const gitHubInfo = session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
	const pullRequests: IGitHubPullRequestRef[] = [];
	const issues: IGitHubIssueRef[] = [];
	for (const artifact of session?.artifacts?.read(reader) ?? []) {
		const parsed = parseGitHubArtifactLink(artifact);
		if (!parsed || !artifact.link) {
			continue;
		}
		const ref = {
			...parsed,
			uri: artifact.link,
			...(artifact.label ? { title: artifact.label } : {}),
			recordedReferenceId: artifact.id,
		};
		if (artifact.kind === SessionArtifactKind.PullRequest) {
			pullRequests.push({ ...ref, createdByThisSession: artifact.isArtifact });
		} else {
			issues.push(ref);
		}
	}
	return {
		pullRequests: mergeGitHubReferences(pullRequests, getGitHubPullRequestRefs(gitHubInfo), (recorded, associated) => ({
			...associated,
			...recorded,
			title: associated.title ?? recorded.title,
			createdByThisSession: recorded.createdByThisSession || associated.createdByThisSession === true,
		})),
		issues: mergeGitHubReferences(issues, gitHubInfo?.issues ?? [], (recorded, associated) => ({
			...associated,
			...recorded,
			title: associated.title ?? recorded.title,
		})),
	};
}
