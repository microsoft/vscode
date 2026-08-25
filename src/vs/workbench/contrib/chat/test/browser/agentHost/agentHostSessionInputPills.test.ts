/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { Changeset, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getAgentHostBackendSession, getAgentHostSessionPillReferences, selectAgentHostSessionChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';

suite('AgentHostSessionInputPills', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('promotes GitHub pull requests and issues out of the artifacts pill', () => {
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'created-pr', type: SessionArtifactType.PullRequest, label: 'Created PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, createdByThisSession: true },
			{ id: 'duplicate-pr', type: SessionArtifactType.PullRequest, label: 'Existing PR', link: 'https://github.com/microsoft/vscode/pull/1/', isGitHub: true },
			{ id: 'issue', type: SessionArtifactType.Issue, label: 'Issue', link: 'https://github.com/microsoft/vscode/issues/3', isGitHub: true },
			{ id: 'website', type: SessionArtifactType.Website, label: 'Preview', link: 'https://example.com' },
		];
		const meta = withSessionGitHubState(
			withSessionArtifacts(undefined, artifacts),
			{
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			},
		);

		const references = getAgentHostSessionPillReferences(meta);

		assert.deepStrictEqual({
			pullRequestUrls: references.pullRequestUrls,
			issueUrls: references.issueUrls,
			artifactIds: references.artifacts.map(artifact => artifact.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/1',
				'https://github.com/microsoft/vscode/pull/2',
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			artifactIds: ['website'],
		});
	});

	test('prefers branch changes and ignores templated turn changesets as fallbacks', () => {
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'copilot:/session/changeset/turn/{turnId}', changeKind: 'turn' },
			{ label: 'Session Changes', uriTemplate: 'copilot:/session/changeset/session', changeKind: 'session' },
			{ label: 'Branch Changes', uriTemplate: 'copilot:/session/changeset/branch', changeKind: 'branch' },
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

	test('preserves a host-owned backend session scheme', () => {
		const session = URI.parse('copilot:/session-id');

		assert.deepStrictEqual({
			defaultSession: getAgentHostBackendSession(session, undefined).toString(),
			cloudSession: getAgentHostBackendSession(session, 'ahp-session').toString(),
		}, {
			defaultSession: 'copilot:/session-id',
			cloudSession: 'ahp-session:/session-id',
		});
	});
});
