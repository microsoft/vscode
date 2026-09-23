/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { parseGitHubIssueUrl } from '../../../../platform/agentHost/common/githubIssueReferences.js';
import { linkKey } from '../../../common/sessionLinks.js';
import { getGitHubPullRequestRefs, IChat, IGitHubIssueRef, IGitHubPullRequestRef, ISession, ISessionArtifact, SessionArtifactKind } from '../../../services/sessions/common/session.js';
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

function isSameRepository(first: { readonly owner: string; readonly repo: string }, second: { readonly owner: string; readonly repo: string }): boolean {
	return first.owner.toLowerCase() === second.owner.toLowerCase() && first.repo.toLowerCase() === second.repo.toLowerCase();
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

/**
 * Resolves recorded GitHub links independently of a workspace, retaining repository-discovered associations.
 * Pass `chat` to use the repository associations of the chat's workspace instead of the session's; recorded
 * pull requests from other repositories are then left out once the chat's repository is known.
 */
export function getSessionGitHubReferences(session: ISession | undefined, reader: IReader | undefined, chat?: IChat): ISessionGitHubReferences {
	// A chat in another folder scope reports its own repository associations.
	const workspace = (chat?.workspace ?? session?.workspace)?.read(reader);
	const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
	const chatRepository = chat ? gitHubInfo : undefined;
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
			if (!chatRepository || isSameRepository(ref, chatRepository)) {
				pullRequests.push({ ...ref, createdByThisSession: artifact.isArtifact });
			}
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
