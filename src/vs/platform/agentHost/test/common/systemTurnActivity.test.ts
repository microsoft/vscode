/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactRequestPresentation } from '../../../artifactIntegrations/common/artifactIntegration.js';
import { createTestArtifactRequestPresentation } from '../../../artifactIntegrations/test/common/artifactIntegrationTestUtils.js';
import { AgentMergePromptContext, AgentMergeRepairAction } from '../../common/agentMerge.js';
import { buildAgentMergePrompt } from '../../common/agentMergePrompt.js';
import { AgentHostArtifactRequestMetaKey, AgentHostArtifactRunMetaKey } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { MessageKind, type Message } from '../../common/state/sessionState.js';
import { getSystemTurnActivity } from '../../common/systemTurnActivity.js';

suite('System turn activity', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const context: AgentMergePromptContext = {
		pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
		title: 'Fix the thing',
		headSha: 'abc123',
		baseRef: 'main',
		headRef: 'user/fix-the-thing',
		reviewThreads: [],
		reviewSummaries: [],
		newComments: [],
		failedChecks: ['Build'],
		behind: false,
		conflicting: false,
		commentWatermark: '2026-08-01T00:00:00.000Z',
	};

	function agentMerge(actions: AgentMergeRepairAction[], kind = MessageKind.SystemNotification): Message {
		return { text: buildAgentMergePrompt(actions, context), origin: { kind }, _meta: toAgentMergeMessageMeta() };
	}

	function artifactRun(presentation: Partial<ArtifactRequestPresentation>): Message {
		return {
			text: 'Fix the checks',
			origin: { kind: MessageKind.SystemNotification },
			_meta: { [AgentHostArtifactRunMetaKey]: 'run-1', [AgentHostArtifactRequestMetaKey]: createTestArtifactRequestPresentation(presentation) },
		};
	}

	test('describes turns the host sent for Agent Merge or an artifact action, and nothing else', () => {
		assert.deepStrictEqual({
			agentMergeFixCI: getSystemTurnActivity(agentMerge(['fixCI'])),
			agentMergeAddressReviews: getSystemTurnActivity(agentMerge(['addressReviews'])),
			agentMergeResolveConflicts: getSystemTurnActivity(agentMerge(['resolveConflicts'])),
			agentMergeSeveralActions: getSystemTurnActivity(agentMerge(['addressReviews', 'fixCI'])),
			agentMergeMarkerOnUserMessage: getSystemTurnActivity(agentMerge(['fixCI'], MessageKind.User)),
			builtInRule: getSystemTurnActivity(artifactRun({ action: { label: 'Fix Checks', iconId: 'github-action', activityLabel: 'Fixing CI' } })),
			extensionRule: getSystemTurnActivity(artifactRun({ action: { label: 'Analyse Scorecard', iconId: 'graph' } })),
			builtInAction: getSystemTurnActivity(artifactRun({ source: 'manual', action: { label: 'Fix Checks', iconId: 'github-action', activityLabel: 'Fixing CI' } })),
			extensionAction: getSystemTurnActivity(artifactRun({ source: 'manual', action: { label: 'Analyse Scorecard', iconId: 'graph' } })),
			hostNotification: getSystemTurnActivity({ text: 'Fix the checks', origin: { kind: MessageKind.SystemNotification } }),
		}, {
			agentMergeFixCI: 'Agent Merge: Fixing CI...',
			agentMergeAddressReviews: 'Agent Merge: Addressing Comments...',
			agentMergeResolveConflicts: 'Agent Merge: Updating Branch...',
			agentMergeSeveralActions: 'Agent Merge: Fixing Pull Request...',
			agentMergeMarkerOnUserMessage: undefined,
			builtInRule: 'Autopilot: Fixing CI...',
			extensionRule: 'Autopilot: Analyse Scorecard...',
			builtInAction: 'Fixing CI...',
			extensionAction: 'Analyse Scorecard...',
			hostNotification: undefined,
		});
	});
});
