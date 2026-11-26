/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactSnapshot, IArtifactIntegrationAccess, isArtifactOptionEnabled } from '../../artifactIntegrations/common/artifactIntegration.js';
import { canEnableArtifactAutomationOption } from '../../artifactIntegrations/common/artifactAutomationConfiguration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { gitHubPullRequestArtifactIntegrationId } from '../common/githubPullRequestArtifact.js';
import type { IPullRequestAutopilotOptions } from '../common/meta/agentPullRequestOperationMeta.js';
import { waitUntil } from './shared/artifactIntegrationServerTools.js';

export const IAgentHostPullRequestAutopilotService = createDecorator<IAgentHostPullRequestAutopilotService>('agentHostPullRequestAutopilotService');

export interface IPullRequestAutopilotResult {
	/** Labels of the requested rules that are now on. */
	readonly enabled: readonly string[];
	/** Labels of the requested rules that could not be turned on and stayed off. */
	readonly unavailable: readonly string[];
}

/** Turns on the Autopilot rules a person chose when creating a pull request. */
export interface IAgentHostPullRequestAutopilotService {
	readonly _serviceBrand: undefined;
	/** Whether Autopilot can be requested: artifact integrations are enabled. */
	isAvailable(): boolean;
	/**
	 * Applies `options` to the pull request integration of the recorded artifact `artifactId`, as the person's own
	 * consent. A newly recorded pull request is applied once its integration observes it. Rules that are still
	 * unavailable then stay off and are reported; the others are applied.
	 */
	enable(session: string, artifactId: string, options: IPullRequestAutopilotOptions): Promise<IPullRequestAutopilotResult>;
}

/** How long a newly recorded pull request's integration may take to observe it before rules are applied. */
const AUTOPILOT_READY_TIMEOUT = 20_000;

export class AgentHostPullRequestAutopilotService implements IAgentHostPullRequestAutopilotService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _access: IArtifactIntegrationAccess,
		private readonly _isEnabled: () => boolean,
		private readonly _readyTimeout = AUTOPILOT_READY_TIMEOUT,
	) { }

	isAvailable(): boolean {
		return this._isEnabled();
	}

	async enable(session: string, artifactId: string, options: IPullRequestAutopilotOptions): Promise<IPullRequestAutopilotResult> {
		if (!this._isEnabled()) {
			throw new Error(localize('agentHost.pr.autopilotDisabled', "Autopilot is unavailable because artifact integrations are disabled in the host configuration."));
		}
		const values: Readonly<Record<string, boolean | string>> = { ...options };
		const requested = (contribution: ArtifactContributionSnapshot): readonly ArtifactAutomationOption[] =>
			contribution.options.filter(option => Object.hasOwn(values, option.id) && isArtifactOptionEnabled(option, values[option.id]));
		const isReady = (snapshot: ArtifactSnapshot) => {
			const contribution = findPullRequestContribution(snapshot);
			return !!contribution && requested(contribution).every(option => canEnableArtifactAutomationOption(contribution, option));
		};
		const reference = await this._access.acquireArtifact(session, artifactId);
		try {
			const model = reference.object;
			const contribution = findPullRequestContribution(await waitUntil(model.snapshot, isReady, this._readyTimeout));
			if (!contribution) {
				throw new Error(localize('agentHost.pr.autopilotIntegrationUnavailable', "The pull request integration does not apply to this pull request."));
			}
			const unavailable = requested(contribution).filter(option => !canEnableArtifactAutomationOption(contribution, option));
			const changes = Object.fromEntries(contribution.options
				.filter(option => Object.hasOwn(values, option.id) && !unavailable.includes(option) && contribution.configuration.values[option.id] !== values[option.id])
				.map(option => [option.id, values[option.id]]));
			if (Object.keys(changes).length) {
				await model.configure(contribution.integrationId, contribution.configuration.revision, changes, { kind: 'user' });
			}
			return {
				enabled: requested(contribution).filter(option => !unavailable.includes(option)).map(option => option.label),
				unavailable: unavailable.map(option => option.label),
			};
		} finally {
			reference.dispose();
		}
	}
}

function findPullRequestContribution(snapshot: ArtifactSnapshot): ArtifactContributionSnapshot | undefined {
	return snapshot.contributions.find(contribution => contribution.integrationId === gitHubPullRequestArtifactIntegrationId);
}
