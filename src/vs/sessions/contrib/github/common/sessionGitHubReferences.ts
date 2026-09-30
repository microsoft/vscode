/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
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

/** Drops associations repeated across folders, keeping distinct recorded entries for the same link. */
function dedupeByLink<T extends { readonly uri: URI; readonly recordedReferenceId?: string }>(refs: readonly T[]): readonly T[] {
	const seen = new Set<string>();
	return refs.filter(ref => {
		const key = `${linkKey(ref.uri.toString())}\u0001${ref.recordedReferenceId ?? ''}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
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
 * Resolves the pull requests and issues for the dedicated GitHub pills: recorded artifacts, independently of a
 * workspace, and repository-discovered associations. Recorded references are left out, as the references pill
 * lists them.
 * Pass `chat` to use the repository associations of every folder of the chat's workspace instead of the
 * session's primary folder; recorded pull requests from other repositories are then left out once the
 * chat's repositories are known.
 */
export function getSessionGitHubReferences(session: ISession | undefined, reader: IReader | undefined, chat?: IChat): ISessionGitHubReferences {
	const chatWorkspace = chat?.workspace?.read(reader);
	// A chat reports the repository associations of each of its folders.
	const folderGitHubInfos = chatWorkspace
		? chatWorkspace.folders.map(folder => folder.gitRepository?.gitHubInfo.read(reader)).filter(isDefined)
		: [];
	const gitHubInfo = chatWorkspace ? folderGitHubInfos[0] : session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
	const chatRepositories = chatWorkspace && folderGitHubInfos.length > 0 ? folderGitHubInfos : undefined;
	const artifacts = session?.artifacts?.read(reader) ?? [];
	// Providers may echo recorded references into their associations; those stay out of the dedicated pills too.
	const recordedReferenceIds = new Set(artifacts.filter(artifact => !artifact.isArtifact).map(artifact => artifact.id));
	const isRecordedReference = (ref: { readonly recordedReferenceId?: string }) => !!ref.recordedReferenceId && recordedReferenceIds.has(ref.recordedReferenceId);
	const associatedPullRequests = (chatWorkspace ? folderGitHubInfos.flatMap(info => getGitHubPullRequestRefs(info)) : getGitHubPullRequestRefs(gitHubInfo)).flatMap(ref => {
		if (!isRecordedReference(ref)) {
			return [ref];
		}
		// A referenced pull request the session also produced remains, as an association rather than as the reference.
		const { recordedReferenceId: _, ...association } = ref;
		return ref.createdByThisSession ? [association] : [];
	});
	const associatedIssues = (chatWorkspace ? folderGitHubInfos.flatMap(info => info.issues ?? []) : gitHubInfo?.issues ?? []).filter(ref => !isRecordedReference(ref));
	const pullRequests: IGitHubPullRequestRef[] = [];
	const issues: IGitHubIssueRef[] = [];
	for (const artifact of artifacts) {
		const parsed = artifact.isArtifact ? parseGitHubArtifactLink(artifact) : undefined;
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
			if (!chatRepositories || chatRepositories.some(repository => isSameRepository(ref, repository))) {
				pullRequests.push({ ...ref, createdByThisSession: true });
			}
		} else {
			issues.push(ref);
		}
	}
	return {
		pullRequests: mergeGitHubReferences(pullRequests, dedupeByLink(associatedPullRequests), (recorded, associated) => ({
			...associated,
			...recorded,
			title: associated.title ?? recorded.title,
			createdByThisSession: recorded.createdByThisSession || associated.createdByThisSession === true,
		})),
		issues: mergeGitHubReferences(issues, dedupeByLink(associatedIssues), (recorded, associated) => ({
			...associated,
			...recorded,
			title: associated.title ?? recorded.title,
		})),
	};
}
