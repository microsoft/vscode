/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { Changeset, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getAgentHostSessionPillMetadata, selectAgentHostSessionChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';

suite('AgentHostSessionInputPills', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('partitions GitHub links, artifacts, and references without duplication', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'created-pr', type: SessionArtifactType.PullRequest, label: 'Created PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'duplicate-pr', type: SessionArtifactType.PullRequest, label: 'Existing PR', link: 'https://github.com/microsoft/vscode/pull/1/', isGitHub: true, isArtifact: false },
			{ id: 'created-issue', type: SessionArtifactType.Issue, label: 'Created Issue', link: 'https://github.com/microsoft/vscode/issues/3', isGitHub: true, isArtifact: true },
			{ id: 'issue-reference', type: SessionArtifactType.Issue, label: 'Related Issue', link: 'https://github.com/microsoft/vscode/issues/4', isGitHub: true, isArtifact: false },
			{ id: 'website', type: SessionArtifactType.Website, label: 'Preview', link: 'https://example.com', isArtifact: true },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Docs', uri: 'https://example.com/docs', isArtifact: false },
		];
		const meta = withSessionGitHubState(
			withSessionArtifacts(undefined, entries),
			{
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			},
		);

		const metadata = getAgentHostSessionPillMetadata(meta);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			issueUrls: metadata.issueUrls,
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/1',
				'https://github.com/microsoft/vscode/pull/2',
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			artifactIds: ['website'],
			referenceIds: ['issue-reference', 'resource'],
		});
	});

	test('prefers branch changes and ignores templated turn changesets as fallbacks', () => {
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'copilot:/session/changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
			{ label: 'Session Changes', uriTemplate: 'copilot:/session/changeset/session', changeKind: ChangesetKind.Session },
			{ label: 'Branch Changes', uriTemplate: 'copilot:/session/changeset/branch', changeKind: ChangesetKind.Branch },
		];

		assert.deepStrictEqual({
			preferred: selectAgentHostSessionChangeset(changesets)?.label,
			fallback: selectAgentHostSessionChangeset(changesets.slice(0, 2))?.label,
			turnOnly: selectAgentHostSessionChangeset(changesets.slice(0, 1))?.label,
		}, {
			preferred: 'Branch Changes',
			fallback: 'Session Changes',
			turnOnly: undefined,
		});
	});
});
