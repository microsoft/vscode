/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactActor, ArtifactContributionSnapshot, ArtifactSnapshot, IArtifactIntegrationAccess, IArtifactModel } from '../../../artifactIntegrations/common/artifactIntegration.js';
import { emptyArtifactConfiguration } from '../../../artifactIntegrations/common/artifactAutomationConfiguration.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactOptions } from '../../common/githubPullRequestArtifact.js';
import type { IPullRequestAutopilotOptions } from '../../common/meta/agentPullRequestOperationMeta.js';
import { AgentHostPullRequestAutopilotService } from '../../node/agentHostPullRequestAutopilot.js';

const session = 'copilot:/autopilot';
const options: IPullRequestAutopilotOptions = { addressReviews: true, fixCI: true, resolveConflicts: false, markReady: true, merge: 'always' };

function contribution(unavailable: readonly string[] = []): ArtifactContributionSnapshot {
	return {
		integrationId: gitHubPullRequestArtifactIntegrationId,
		label: 'GitHub Pull Request',
		view: {
			availability: { kind: 'available' },
			sections: [],
			stateActions: [],
			generalActions: [],
			automationAvailability: gitHubPullRequestArtifactOptions.map(option => ({ id: option.id, available: !unavailable.includes(option.id), ...(unavailable.includes(option.id) ? { unavailableReason: 'Waiting.' } : {}) })),
		},
		actions: [],
		options: gitHubPullRequestArtifactOptions,
		configuration: emptyArtifactConfiguration(gitHubPullRequestArtifactOptions),
	};
}

function createAccess(contributions: readonly ArtifactContributionSnapshot[]) {
	const configured: { readonly integrationId: string; readonly revision: number; readonly values: Readonly<Record<string, boolean | string>>; readonly actor?: ArtifactActor }[] = [];
	const acquired: string[] = [];
	let released = 0;
	const snapshot = observableValue<ArtifactSnapshot>('snapshot', {
		authority: { id: 'host', targetHost: 'self', location: 'host' },
		session,
		artifact: { id: 'pr', resource: 'https://github.com/microsoft/vscode/pull/1', label: 'Fix login', isArtifact: true },
		contributions,
		runs: [],
	});
	const model = new class extends mock<IArtifactModel>() {
		override readonly snapshot = snapshot;
		override async configure(integrationId: string, revision: number, values: Readonly<Record<string, boolean | string>>, actor?: ArtifactActor): Promise<void> {
			configured.push({ integrationId, revision, values, actor });
		}
	}();
	const access: IArtifactIntegrationAccess = {
		acquireArtifact: async (_session, artifactId) => {
			acquired.push(artifactId);
			return { object: model, dispose: () => released++ };
		},
	};
	return { access, snapshot, configured, acquired, released: () => released };
}

suite('AgentHostPullRequestAutopilotService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the integration to observe the pull request, then turns on the changed rules as the user', async () => {
		const { access, snapshot, configured, acquired, released } = createAccess([]);
		const service = new AgentHostPullRequestAutopilotService(access, () => true);
		const result = service.enable(session, 'pr', options);
		await Promise.resolve();
		const configuredBeforeObservation = configured.length;
		snapshot.set({ ...snapshot.get(), contributions: [contribution()] }, undefined);
		assert.deepStrictEqual({ result: await result, configuredBeforeObservation, configured, acquired, released: released() }, {
			result: {
				enabled: ['Automatically Address Reviews', 'Automatically Fix CI', 'Automatically Mark Ready', 'Merge Automatically When Ready'],
				unavailable: [],
			},
			configuredBeforeObservation: 0,
			configured: [{
				integrationId: gitHubPullRequestArtifactIntegrationId,
				revision: 0,
				values: { addressReviews: true, fixCI: true, markReady: true, merge: 'always' },
				actor: { kind: 'user' },
			}],
			acquired: ['pr'],
			released: 1,
		});
	});

	test('turns on the available rules and reports the rules that stay unavailable', async () => {
		const { access, configured } = createAccess([contribution(['markReady'])]);
		const service = new AgentHostPullRequestAutopilotService(access, () => true, 0);
		assert.deepStrictEqual({ result: await service.enable(session, 'pr', options), values: configured.map(entry => entry.values) }, {
			result: {
				enabled: ['Automatically Address Reviews', 'Automatically Fix CI', 'Merge Automatically When Ready'],
				unavailable: ['Automatically Mark Ready'],
			},
			values: [{ addressReviews: true, fixCI: true, merge: 'always' }],
		});
	});

	test('changes nothing while artifact integrations are disabled', async () => {
		const { access, acquired } = createAccess([contribution()]);
		const service = new AgentHostPullRequestAutopilotService(access, () => false);
		await assert.rejects(() => service.enable(session, 'pr', options), /artifact integrations are disabled/);
		assert.deepStrictEqual({ available: service.isAvailable(), acquired }, { available: false, acquired: [] });
	});
});
