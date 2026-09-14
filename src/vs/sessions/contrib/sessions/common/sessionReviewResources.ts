/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { getGitHubPullRequestRefs, IGitHubPullRequestRef, ISession, ISessionArtifact, SessionArtifactKind } from '../../../services/sessions/common/session.js';
import { getPullRequestKey, parseGitHubPullRequestUrl } from '../../github/common/utils.js';

export function getArtifactPullRequest(artifact: ISessionArtifact): IGitHubPullRequestRef | undefined {
	if (artifact.kind !== SessionArtifactKind.PullRequest) {
		return undefined;
	}
	const uri = (artifact.link ?? artifact.uri)?.with({ query: '', fragment: '' });
	const reference = uri && parseGitHubPullRequestUrl(uri.toString());
	return uri && reference ? { ...reference, uri, title: artifact.label, createdByThisSession: artifact.isArtifact } : undefined;
}

export function getSessionReviewPullRequests(session: ISession, reader?: IReader): readonly IGitHubPullRequestRef[] {
	const references = new Map<string, IGitHubPullRequestRef>();
	const add = (reference: IGitHubPullRequestRef) => {
		const key = getPullRequestKey(reference.owner, reference.repo, reference.number).toLowerCase();
		if (!references.has(key)) {
			references.set(key, reference);
		}
	};
	for (const folder of session.workspace.read(reader)?.folders ?? []) {
		for (const reference of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
			add(reference);
		}
	}
	for (const artifact of session.artifacts?.read(reader) ?? []) {
		const reference = getArtifactPullRequest(artifact);
		if (reference) {
			add(reference);
		}
	}
	return [...references.values()];
}
