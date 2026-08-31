/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { getErrorMessage, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { CustomizationMigrationCandidate, CustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, isMcpServerCustomizationMigrationCandidate } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId, ICustomizationMigrationCategory } from './customizationMigrationCategories.js';

export interface ICustomizationMigrationModelState {
	readonly loading: boolean;
	readonly loadError?: string;
	readonly candidatesByCategory: ReadonlyMap<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>;
	readonly targetFoldersByType: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>;
}

const emptyMigrationState: ICustomizationMigrationModelState = {
	loading: false,
	candidatesByCategory: new Map(),
	targetFoldersByType: new Map(),
};

/**
 * Owns migration discovery and refresh lifecycle independently from the management editor's DOM.
 */
export class CustomizationMigrationModel extends Disposable {
	private readonly _state = observableValue<ICustomizationMigrationModelState>(this, emptyMigrationState);
	readonly state: IObservable<ICustomizationMigrationModelState> = this._state;

	private refreshSequence = 0;
	private workingDirectoriesSignature = '';
	private contextKey = '';
	private readonly pendingCategories = new Set<CustomizationMigrationCategoryId>();
	private readonly categoriesPendingAfterFullRefresh = new Set<CustomizationMigrationCategoryId>();
	private fullRefreshInProgress = false;
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => {
		const categories = new Set(this.pendingCategories);
		this.pendingCategories.clear();
		void this.refreshCategories(categories);
	}, 0));

	constructor(
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IPromptsService promptsService: IPromptsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMcpService mcpService: IMcpService,
		@IAgentHostCustomizationService agentHostCustomizationService: IAgentHostCustomizationService,
	) {
		super();

		this._register(promptsService.onDidChangeSlashCommands(() => this.scheduleRefresh([CustomizationMigrationCategoryId.PromptFiles])));
		this._register(Event.any(
			promptsService.onDidChangeCustomAgents,
			promptsService.onDidChangeInstructions,
			promptsService.onDidChangeAgentInstructions,
		)(() => this.scheduleRefresh([CustomizationMigrationCategoryId.UserData])));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (CUSTOMIZATION_MIGRATION_CATEGORIES.some(category => category.enablementSetting && event.affectsConfiguration(category.enablementSetting))) {
				this.scheduleRefresh();
			}
		}));
		this._register(autorun(reader => {
			const sessionResource = harnessService.activeSessionResource.read(reader);
			const harnessId = harnessService.activeHarness.read(reader);
			const nextContextKey = `${harnessId}\n${sessionResource.toString()}`;
			if (nextContextKey !== this.contextKey) {
				this.contextKey = nextContextKey;
				this._state.set(emptyMigrationState, undefined);
			}
			this.workingDirectoriesSignature = agentHostCustomizationService.getWorkingDirectories(sessionResource).join('\n');
			this.scheduleRefresh();
		}));
		this._register(autorun(reader => {
			for (const server of mcpService.servers.read(reader)) {
				server.enablement.read(reader);
				server.readDefinitions().read(reader);
			}
			this.scheduleRefresh([CustomizationMigrationCategoryId.McpServers]);
		}));
		this._register(agentHostCustomizationService.onDidChangeCustomizations(() => {
			const sessionResource = harnessService.activeSessionResource.get();
			const nextSignature = agentHostCustomizationService.getWorkingDirectories(sessionResource).join('\n');
			if (nextSignature !== this.workingDirectoriesSignature) {
				this.workingDirectoriesSignature = nextSignature;
				this.scheduleRefresh();
			}
		}));
	}

	async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		this.pendingCategories.clear();
		await this.refreshCategories(new Set(CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => category.id)));
	}

	private scheduleRefresh(categories = CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => category.id)): void {
		for (const category of categories) {
			this.pendingCategories.add(category);
		}
		this.refreshScheduler.schedule();
	}

	private async refreshCategories(categoryIds: ReadonlySet<CustomizationMigrationCategoryId>): Promise<void> {
		const isFullRefresh = categoryIds.size === CUSTOMIZATION_MIGRATION_CATEGORIES.length;
		if (!isFullRefresh && this.fullRefreshInProgress) {
			for (const categoryId of categoryIds) {
				this.categoriesPendingAfterFullRefresh.add(categoryId);
			}
			return;
		}
		if (isFullRefresh) {
			this.fullRefreshInProgress = true;
		}
		try {
			await this.doRefreshCategories(categoryIds, isFullRefresh);
		} finally {
			if (isFullRefresh) {
				this.fullRefreshInProgress = false;
				if (this.categoriesPendingAfterFullRefresh.size > 0) {
					this.scheduleRefresh([...this.categoriesPendingAfterFullRefresh]);
					this.categoriesPendingAfterFullRefresh.clear();
				}
			}
		}
	}

	private async doRefreshCategories(categoryIds: ReadonlySet<CustomizationMigrationCategoryId>, isFullRefresh: boolean): Promise<void> {
		const activeHarnessId = this.harnessService.activeHarness.get();
		const activeSessionResource = this.harnessService.activeSessionResource.get();
		const refreshSequence = ++this.refreshSequence;
		this._state.set({
			...this._state.get(),
			loading: isFullRefresh,
			loadError: undefined,
		}, undefined);

		if (!isAgentHostTarget(activeHarnessId)) {
			this.setStateIfCurrent(refreshSequence, activeHarnessId, activeSessionResource, emptyMigrationState);
			return;
		}

		try {
			const enabledCategories = this.getEnabledCategories();
			if (enabledCategories.length === 0) {
				this.setStateIfCurrent(refreshSequence, activeHarnessId, activeSessionResource, emptyMigrationState);
				return;
			}

			const categoriesToRefresh = enabledCategories.filter(category => categoryIds.has(category.id));
			const migrationsByCategory = await Promise.all(categoriesToRefresh.map(async category => {
				const migration = category.migrationType === CustomizationMigrationType.McpServers
					? await this.migrationService.computeMigration(activeSessionResource, CustomizationMigrationType.McpServers)
					: await this.migrationService.computeMigration(activeSessionResource, category.migrationType);
				return [category.id, migration.candidates] as const;
			}));
			if (!this.isCurrent(refreshSequence, activeHarnessId, activeSessionResource)) {
				return;
			}

			const enabledCategoryIds = new Set(enabledCategories.map(category => category.id));
			const candidatesByCategory = new Map(
				[...this._state.get().candidatesByCategory].filter(([categoryId]) => enabledCategoryIds.has(categoryId))
			);
			for (const [categoryId, candidates] of migrationsByCategory) {
				candidatesByCategory.set(categoryId, candidates);
			}
			const refreshesFileCategories = categoriesToRefresh.some(category => category.migrationType !== CustomizationMigrationType.McpServers);
			let targetFoldersByType = this._state.get().targetFoldersByType;
			if (refreshesFileCategories) {
				const provider = this.harnessService.findHarnessById(activeHarnessId)?.itemProvider;
				const targetTypes = new Set([...candidatesByCategory.values()].flat()
					.filter(candidate => !isMcpServerCustomizationMigrationCandidate(candidate))
					.map(getCustomizationMigrationTargetType));
				const targetFolderEntries = await Promise.all([...targetTypes].map(async targetType => {
					const folders = await provider?.provideSourceFolders?.(activeSessionResource, targetType, CancellationToken.None);
					return [targetType, folders ?? []] as const;
				}));
				targetFoldersByType = new Map(targetFolderEntries);
			}
			this.setStateIfCurrent(refreshSequence, activeHarnessId, activeSessionResource, {
				loading: false,
				candidatesByCategory,
				targetFoldersByType,
			});
		} catch (error) {
			if (this.isCurrent(refreshSequence, activeHarnessId, activeSessionResource)) {
				this._state.set({
					...this._state.get(),
					loading: false,
					loadError: getErrorMessage(error),
				}, undefined);
			}
			onUnexpectedError(error);
		}
	}

	private getEnabledCategories(): readonly ICustomizationMigrationCategory[] {
		return CUSTOMIZATION_MIGRATION_CATEGORIES.filter(category => this.isCategoryEnabled(category.id));
	}

	isCategoryEnabled(categoryId: CustomizationMigrationCategoryId): boolean {
		const category = CUSTOMIZATION_MIGRATION_CATEGORIES.find(candidate => candidate.id === categoryId);
		return !!category && (!category.enablementSetting || this.configurationService.getValue<boolean>(category.enablementSetting) === true);
	}

	private setStateIfCurrent(
		refreshSequence: number,
		activeHarnessId: string,
		activeSessionResource: URI,
		state: ICustomizationMigrationModelState,
	): void {
		if (this.isCurrent(refreshSequence, activeHarnessId, activeSessionResource)) {
			this._state.set(state, undefined);
		}
	}

	private isCurrent(refreshSequence: number, activeHarnessId: string, activeSessionResource: URI): boolean {
		return refreshSequence === this.refreshSequence
			&& activeHarnessId === this.harnessService.activeHarness.get()
			&& isEqual(activeSessionResource, this.harnessService.activeSessionResource.get());
	}
}
