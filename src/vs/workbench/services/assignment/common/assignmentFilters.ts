/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExperimentationFilterProvider } from 'tas-client';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getInternalOrg } from '../../../../platform/assignment/common/assignment.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';

export enum ExtensionsFilter {

	/**
	 * Version of the github.copilot extension.
	 */
	CopilotExtensionVersion = 'X-Copilot-RelatedPluginVersion-githubcopilot',

	/**
	 * Version of the github.copilot-chat extension.
	 */
	CopilotChatExtensionVersion = 'X-Copilot-RelatedPluginVersion-githubcopilotchat',

	/**
	 * Version of the completions version.
	 */
	CompletionsVersionInCopilotChat = 'X-VSCode-CompletionsInChatExtensionVersion',

	/**
	 * SKU of the copilot entitlement.
	 */
	CopilotSku = 'X-GitHub-Copilot-SKU',

	/**
	 * The internal org of the user.
	 */
	MicrosoftInternalOrg = 'X-Microsoft-Internal-Org',

	/**
	 * The tracking ID of the user from Copilot entitlement API.
	 */
	CopilotTrackingId = 'X-Copilot-CopilotTrackingId',

	/**
	 * Whether the `sn` flag is set to `'1'` in the copilot token.
	 */
	CopilotIsSn = 'X-GitHub-Copilot-IsSn',

	/**
	 * Whether the `fcv1` flag is set to `'1'` in the copilot token.
	 */
	CopilotIsFcv1 = 'X-GitHub-Copilot-IsFcv1',
}

enum StorageVersionKeys {
	CopilotExtensionVersion = 'extensionsAssignmentFilterProvider.copilotExtensionVersion',
	CopilotChatExtensionVersion = 'extensionsAssignmentFilterProvider.copilotChatExtensionVersion',
	CompletionsVersion = 'extensionsAssignmentFilterProvider.copilotCompletionsVersion',
	CopilotSku = 'extensionsAssignmentFilterProvider.copilotSku',
	CopilotInternalOrg = 'extensionsAssignmentFilterProvider.copilotInternalOrg',
	CopilotTrackingId = 'extensionsAssignmentFilterProvider.copilotTrackingId',
	CopilotIsSn = 'extensionsAssignmentFilterProvider.copilotIsSn',
	CopilotIsFcv1 = 'extensionsAssignmentFilterProvider.copilotIsFcv1',
}

export class CopilotAssignmentFilterProvider extends Disposable implements IExperimentationFilterProvider {
	private copilotChatExtensionVersion: string | undefined;
	private copilotExtensionVersion: string | undefined;
	// TODO@benibenj remove this when completions have been ported to chat
	private copilotCompletionsVersion: string | undefined;

	private copilotInternalOrg: string | undefined;
	private copilotSku: string | undefined;
	private copilotTrackingId: string | undefined;
	private copilotIsSn: string | undefined;
	private copilotIsFcv1: string | undefined;

	private readonly _onDidChangeFilters = this._register(new Emitter<void>());
	readonly onDidChangeFilters = this._onDidChangeFilters.event;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();

		this.copilotExtensionVersion = this._storageService.get(StorageVersionKeys.CopilotExtensionVersion, StorageScope.PROFILE);
		this.copilotChatExtensionVersion = this._storageService.get(StorageVersionKeys.CopilotChatExtensionVersion, StorageScope.PROFILE);
		this.copilotCompletionsVersion = this._storageService.get(StorageVersionKeys.CompletionsVersion, StorageScope.PROFILE);
		this.copilotSku = this._storageService.get(StorageVersionKeys.CopilotSku, StorageScope.PROFILE);
		this.copilotInternalOrg = this._storageService.get(StorageVersionKeys.CopilotInternalOrg, StorageScope.PROFILE);
		this.copilotTrackingId = this._storageService.get(StorageVersionKeys.CopilotTrackingId, StorageScope.PROFILE);
		this.copilotIsSn = this._storageService.get(StorageVersionKeys.CopilotIsSn, StorageScope.PROFILE);
		this.copilotIsFcv1 = this._storageService.get(StorageVersionKeys.CopilotIsFcv1, StorageScope.PROFILE);

		this.updateExtensionVersions();
		this.updateCopilotEntitlementInfo();
		this.updateCopilotTokenInfo();

		this._register(this._extensionService.onDidChangeExtensionsStatus(extensionIdentifiers => {
			if (extensionIdentifiers.some(identifier => ExtensionIdentifier.equals(identifier, 'github.copilot') || ExtensionIdentifier.equals(identifier, 'github.copilot-chat'))) {
				this.updateExtensionVersions();
			}
		}));

		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => {
			this.updateCopilotEntitlementInfo();
		}));

		this._register(this._defaultAccountService.onDidChangeCopilotTokenInfo(() => {
			this.updateCopilotTokenInfo();
		}));
	}

	private async updateExtensionVersions() {
		let copilotExtensionVersion;
		let copilotChatExtensionVersion;
		let copilotCompletionsVersion;

		try {
			const [copilotExtension, copilotChatExtension] = await Promise.all([
				this._extensionService.getExtension('github.copilot'),
				this._extensionService.getExtension('github.copilot-chat'),
			]);

			copilotExtensionVersion = copilotExtension?.version;
			copilotChatExtensionVersion = copilotChatExtension?.version;
			copilotCompletionsVersion = (copilotChatExtension as typeof copilotChatExtension & { completionsCoreVersion?: string })?.completionsCoreVersion;
		} catch (error) {
			this._logService.error('Failed to update extension version assignments', error);
		}

		if (this.copilotCompletionsVersion === copilotCompletionsVersion &&
			this.copilotExtensionVersion === copilotExtensionVersion &&
			this.copilotChatExtensionVersion === copilotChatExtensionVersion) {
			return;
		}

		this.copilotExtensionVersion = copilotExtensionVersion;
		this.copilotChatExtensionVersion = copilotChatExtensionVersion;
		this.copilotCompletionsVersion = copilotCompletionsVersion;

		this._storageService.store(StorageVersionKeys.CopilotExtensionVersion, this.copilotExtensionVersion, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._storageService.store(StorageVersionKeys.CopilotChatExtensionVersion, this.copilotChatExtensionVersion, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._storageService.store(StorageVersionKeys.CompletionsVersion, this.copilotCompletionsVersion, StorageScope.PROFILE, StorageTarget.MACHINE);

		// Notify that the filters have changed.
		this._onDidChangeFilters.fire();
	}

	private updateCopilotEntitlementInfo() {
		const newSku = this._chatEntitlementService.sku;
		const newTrackingId = this._chatEntitlementService.copilotTrackingId;
		const newInternalOrg = getInternalOrg(this._chatEntitlementService.organisations);

		if (this.copilotSku === newSku && this.copilotInternalOrg === newInternalOrg && this.copilotTrackingId === newTrackingId) {
			return;
		}

		this.copilotSku = newSku;
		this.copilotInternalOrg = newInternalOrg;
		this.copilotTrackingId = newTrackingId;

		this._storageService.store(StorageVersionKeys.CopilotSku, this.copilotSku, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._storageService.store(StorageVersionKeys.CopilotInternalOrg, this.copilotInternalOrg, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._storageService.store(StorageVersionKeys.CopilotTrackingId, this.copilotTrackingId, StorageScope.PROFILE, StorageTarget.MACHINE);

		// Notify that the filters have changed.
		this._onDidChangeFilters.fire();
	}

	private updateCopilotTokenInfo() {
		const tokenInfo = this._defaultAccountService.copilotTokenInfo;
		const newIsSn = tokenInfo?.sn === '1' ? '1' : '0';
		const newIsFcv1 = tokenInfo?.fcv1 === '1' ? '1' : '0';

		if (this.copilotIsSn === newIsSn && this.copilotIsFcv1 === newIsFcv1) {
			return;
		}

		this.copilotIsSn = newIsSn;
		this.copilotIsFcv1 = newIsFcv1;

		this._storageService.store(StorageVersionKeys.CopilotIsSn, this.copilotIsSn, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._storageService.store(StorageVersionKeys.CopilotIsFcv1, this.copilotIsFcv1, StorageScope.PROFILE, StorageTarget.MACHINE);

		// Notify that the filters have changed.
		this._onDidChangeFilters.fire();
	}

	/**
	 * Returns a version string that can be parsed by the TAS client.
	 * The tas client cannot handle suffixes lke "-insider"
	 * Ref: https://github.com/microsoft/tas-client/blob/30340d5e1da37c2789049fcf45928b954680606f/vscode-tas-client/src/vscode-tas-client/VSCodeFilterProvider.ts#L35
	 *
	 * @param version Version string to be trimmed.
	*/
	private static trimVersionSuffix(version: string): string {
		const regex = /\-[a-zA-Z0-9]+$/;
		const result = version.split(regex);

		return result[0];
	}

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case ExtensionsFilter.CopilotExtensionVersion:
				return this.copilotExtensionVersion ? CopilotAssignmentFilterProvider.trimVersionSuffix(this.copilotExtensionVersion) : null;
			case ExtensionsFilter.CompletionsVersionInCopilotChat:
				return this.copilotCompletionsVersion ? CopilotAssignmentFilterProvider.trimVersionSuffix(this.copilotCompletionsVersion) : null;
			case ExtensionsFilter.CopilotChatExtensionVersion:
				return this.copilotChatExtensionVersion ? CopilotAssignmentFilterProvider.trimVersionSuffix(this.copilotChatExtensionVersion) : null;
			case ExtensionsFilter.CopilotSku:
				return this.copilotSku ?? null;
			case ExtensionsFilter.MicrosoftInternalOrg:
				return this.copilotInternalOrg ?? null;
			case ExtensionsFilter.CopilotTrackingId:
				return this.copilotTrackingId ?? null;
			case ExtensionsFilter.CopilotIsSn:
				return this.copilotIsSn ?? null;
			case ExtensionsFilter.CopilotIsFcv1:
				return this.copilotIsFcv1 ?? null;
			default:
				return null;
		}
	}

	getFilters(): Map<string, string | null> {
		const filters = new Map<string, string | null>();
		const filterValues = Object.values(ExtensionsFilter);
		for (const value of filterValues) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

/**
 * userParam names for the new TAS assignments API (POST /api/v1/assignments) that carry
 * the GitHub account signals available in core. Hex org/business ids are not yet parsed
 * in core, so they are intentionally omitted here.
 */
export enum GitHubAssignmentsFilter {
	CopilotTrackingId = 'copilottrackingid',
	IsGhOrMsftStaff = 'github_core_isghormsftstaff',
	GhMsftOrExternal = 'github_core_ghmsftorexternal',
}

/**
 * Emits the core-available GitHub account filters for the new TAS assignments API using
 * the new userParam key names.
 */
export class GitHubCoreAssignmentsFilterProvider extends Disposable implements IExperimentationFilterProvider {
	private copilotTrackingId: string | undefined;
	private internalOrg: 'vscode' | 'github' | 'microsoft' | undefined;

	private readonly _onDidChangeFilters = this._register(new Emitter<void>());
	readonly onDidChangeFilters = this._onDidChangeFilters.event;

	constructor(
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this.update()));
		this.update();
	}

	private update(): void {
		const newTrackingId = this._chatEntitlementService.copilotTrackingId ?? this.copilotTrackingId;
		const newInternalOrg = getInternalOrg(this._chatEntitlementService.organisations);

		if (this.copilotTrackingId === newTrackingId && this.internalOrg === newInternalOrg) {
			return;
		}

		this.copilotTrackingId = newTrackingId;
		this.internalOrg = newInternalOrg;

		this._onDidChangeFilters.fire();
	}

	getFilterValue(filter: string): string | null {
		// copilotTrackingId is the stable user id (it never changes) but can be unavailable
		// during sign-in delays. Latch the first known value and fall back to it so the
		// filter is not dropped from later requests once we have seen it.
		const liveTrackingId = this._chatEntitlementService.copilotTrackingId;
		if (liveTrackingId) {
			this.copilotTrackingId = liveTrackingId;
		}
		const copilotTrackingId = liveTrackingId ?? this.copilotTrackingId;
		const internalOrg = getInternalOrg(this._chatEntitlementService.organisations) ?? this.internalOrg;
		switch (filter) {
			case GitHubAssignmentsFilter.CopilotTrackingId:
				return copilotTrackingId ?? null;
			case GitHubAssignmentsFilter.IsGhOrMsftStaff:
				return internalOrg ? '1' : '0';
			case GitHubAssignmentsFilter.GhMsftOrExternal:
				return internalOrg === 'github'
					? 'github'
					: (internalOrg === 'microsoft' || internalOrg === 'vscode')
						? 'microsoft'
						: 'external';
			default:
				return null;
		}
	}

	getFilters(): Map<string, string | null> {
		const filters = new Map<string, string | null>();
		for (const value of Object.values(GitHubAssignmentsFilter)) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}
