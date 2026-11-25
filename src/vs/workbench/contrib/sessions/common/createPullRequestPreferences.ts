/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionPullRequestAgentMergeOptions, ISessionPullRequestAutopilotOptions, SessionPullRequestMergeMethod } from './pullRequestCreation.js';

export type CreatePullRequestAction = 'create' | 'sendToChat';
export type CreatePullRequestMergeMode = 'manual' | 'agent' | 'autopilot' | 'auto';

export interface ICreatePullRequestPreferences {
	readonly draft?: boolean;
	readonly mergeMode?: CreatePullRequestMergeMode;
	readonly mergeMethod?: SessionPullRequestMergeMethod;
	readonly agentMergeOptions?: ISessionPullRequestAgentMergeOptions;
	readonly autopilotOptions?: ISessionPullRequestAutopilotOptions;
	readonly primaryAction?: CreatePullRequestAction;
}

/** Stores user choices, independently of a particular session's effective capabilities. */
export class CreatePullRequestPreferences {
	private static readonly storageKey = 'sessions.createPullRequest.preferences';

	constructor(
		private readonly storageService: IStorageService,
		private readonly logService: ILogService,
	) { }

	read(): ICreatePullRequestPreferences {
		let stored: ICreatePullRequestPreferences | undefined;
		try {
			stored = this.storageService.getObject<ICreatePullRequestPreferences>(CreatePullRequestPreferences.storageKey, StorageScope.PROFILE);
		} catch {
			// Deserialization errors can include stored content, so log only the operation that failed.
			this.logService.warn('[CreatePullRequestPreferences] Could not read pull request preferences; using defaults.');
			return {};
		}
		return this.validate(stored);
	}

	update(change: ICreatePullRequestPreferences): void {
		this.storageService.store(CreatePullRequestPreferences.storageKey, this.validate({ ...this.read(), ...change }), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private validate(stored: ICreatePullRequestPreferences | undefined): ICreatePullRequestPreferences {
		if (!stored || typeof stored !== 'object') {
			return {};
		}
		const agent = stored.agentMergeOptions;
		const autopilot = stored.autopilotOptions;
		return {
			...(typeof stored.draft === 'boolean' ? { draft: stored.draft } : {}),
			...(stored.mergeMode === 'manual' || stored.mergeMode === 'agent' || stored.mergeMode === 'autopilot' || stored.mergeMode === 'auto' ? { mergeMode: stored.mergeMode } : {}),
			...(stored.mergeMethod === 'MERGE' || stored.mergeMethod === 'SQUASH' || stored.mergeMethod === 'REBASE' ? { mergeMethod: stored.mergeMethod } : {}),
			...(stored.primaryAction === 'create' || stored.primaryAction === 'sendToChat' ? { primaryAction: stored.primaryAction } : {}),
			...(agent && typeof agent.addressReviews === 'boolean' && typeof agent.fixCI === 'boolean' && typeof agent.resolveConflicts === 'boolean'
				&& (agent.mergePullRequest === 'never' || agent.mergePullRequest === 'ifUnchanged' || agent.mergePullRequest === 'always') ? {
				agentMergeOptions: {
					addressReviews: agent.addressReviews,
					fixCI: agent.fixCI,
					resolveConflicts: agent.resolveConflicts,
					mergePullRequest: agent.mergePullRequest,
				},
			} : {}),
			...(autopilot && typeof autopilot.addressReviews === 'boolean' && typeof autopilot.fixCI === 'boolean' && typeof autopilot.resolveConflicts === 'boolean'
				&& typeof autopilot.markReady === 'boolean' && (autopilot.merge === 'never' || autopilot.merge === 'ifUnchanged' || autopilot.merge === 'always') ? {
				autopilotOptions: {
					addressReviews: autopilot.addressReviews,
					fixCI: autopilot.fixCI,
					resolveConflicts: autopilot.resolveConflicts,
					markReady: autopilot.markReady,
					merge: autopilot.merge,
				},
			} : {}),
		};
	}
}
