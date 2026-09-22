/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentMergeSettingId } from '../../../../platform/agentHost/common/agentMerge.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { InboxNotificationActionKind } from '../common/inboxNotificationsService.js';

const AGENT_MERGE_ALWAYS_PROMPT_STORAGE_KEY_PREFIX = 'sessions.inboxNotifications.agentMergeAlways';
export const AGENT_MERGE_ALWAYS_PROMPT_INTERVAL = 10;

export type InboxAgentMergeActionKind =
	| InboxNotificationActionKind.AgentMergeFixCI
	| InboxNotificationActionKind.AgentMergeAddressReviews
	| InboxNotificationActionKind.AgentMergeMergePullRequest;

export interface IAgentMergeAlwaysPromptDecision {
	readonly shouldPrompt: boolean;
	readonly usageCount: number;
}

interface IAgentMergeAlwaysSettingTarget {
	readonly settingId: string;
	readonly value: boolean | 'always';
}

export function isInboxAgentMergeActionKind(kind: InboxNotificationActionKind): kind is InboxAgentMergeActionKind {
	return kind === InboxNotificationActionKind.AgentMergeFixCI
		|| kind === InboxNotificationActionKind.AgentMergeAddressReviews
		|| kind === InboxNotificationActionKind.AgentMergeMergePullRequest;
}

export class InboxAgentMergeAlwaysOptInService {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	recordUsage(kind: InboxAgentMergeActionKind): IAgentMergeAlwaysPromptDecision {
		const usageCount = this.storageService.getNumber(this.storageKey(kind, 'usageCount'), StorageScope.PROFILE, 0) + 1;
		this.storageService.store(this.storageKey(kind, 'usageCount'), usageCount, StorageScope.PROFILE, StorageTarget.USER);

		if (this.storageService.getBoolean(this.storageKey(kind, 'suppressPrompt'), StorageScope.PROFILE, false) || this.isAlwaysEnabled(kind)) {
			return { shouldPrompt: false, usageCount };
		}

		const milestone = Math.floor(usageCount / AGENT_MERGE_ALWAYS_PROMPT_INTERVAL) * AGENT_MERGE_ALWAYS_PROMPT_INTERVAL;
		if (milestone < AGENT_MERGE_ALWAYS_PROMPT_INTERVAL) {
			return { shouldPrompt: false, usageCount };
		}

		const lastPromptMilestone = this.storageService.getNumber(this.storageKey(kind, 'lastPromptMilestone'), StorageScope.PROFILE, 0);
		if (milestone <= lastPromptMilestone) {
			return { shouldPrompt: false, usageCount };
		}

		this.storageService.store(this.storageKey(kind, 'lastPromptMilestone'), milestone, StorageScope.PROFILE, StorageTarget.USER);
		return { shouldPrompt: true, usageCount };
	}

	suppressPrompt(kind: InboxAgentMergeActionKind): void {
		this.storageService.store(this.storageKey(kind, 'suppressPrompt'), true, StorageScope.PROFILE, StorageTarget.USER);
	}

	isAlwaysEnabled(kind: InboxAgentMergeActionKind): boolean {
		switch (kind) {
			case InboxNotificationActionKind.AgentMergeFixCI:
				return this.configurationService.getValue<boolean>(AgentMergeSettingId.FixCI) === true;
			case InboxNotificationActionKind.AgentMergeAddressReviews:
				return this.configurationService.getValue<boolean>(AgentMergeSettingId.AddressReviews) === true;
			case InboxNotificationActionKind.AgentMergeMergePullRequest:
				return this.configurationService.getValue<string>(AgentMergeSettingId.MergePullRequest) === 'always';
		}
	}

	async enableAlways(kind: InboxAgentMergeActionKind): Promise<void> {
		const target = this.getSettingTarget(kind);
		await this.configurationService.updateValue(target.settingId, target.value, ConfigurationTarget.USER);
	}

	private getSettingTarget(kind: InboxAgentMergeActionKind): IAgentMergeAlwaysSettingTarget {
		switch (kind) {
			case InboxNotificationActionKind.AgentMergeFixCI:
				return { settingId: AgentMergeSettingId.FixCI, value: true };
			case InboxNotificationActionKind.AgentMergeAddressReviews:
				return { settingId: AgentMergeSettingId.AddressReviews, value: true };
			case InboxNotificationActionKind.AgentMergeMergePullRequest:
				return { settingId: AgentMergeSettingId.MergePullRequest, value: 'always' };
		}
	}

	private storageKey(kind: InboxAgentMergeActionKind, suffix: string): string {
		return `${AGENT_MERGE_ALWAYS_PROMPT_STORAGE_KEY_PREFIX}.${kind}.${suffix}`;
	}
}
