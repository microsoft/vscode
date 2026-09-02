/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { RunOnceScheduler, Throttler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { getErrorMessage, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { CustomizationMigrationCandidate, CustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, isMcpServerCustomizationMigrationCandidate } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';

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

const allMigrationCategoryIds = CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => category.id);

interface ICustomizationMigrationRefreshContext {
	readonly generation: number;
	readonly harnessId: string;
	readonly sessionResource: URI;
}

type CustomizationMigrationCategoryCandidates = readonly [
	CustomizationMigrationCategoryId,
	readonly CustomizationMigrationCandidate[],
];

/**
 * Owns migration discovery and refresh lifecycle independently from the management editor's DOM.
 */
export class CustomizationMigrationModel extends Disposable {
	private readonly _state = observableValue<ICustomizationMigrationModelState>(this, emptyMigrationState);
	readonly state: IObservable<ICustomizationMigrationModelState> = this._state;

	// Prevents an in-flight refresh from publishing after the session or working-directory context changes away and back.
	private contextGeneration = 0;
	private workingDirectoriesSignature = '';
	private contextKey = '';
	private readonly pendingCategories = new Set<CustomizationMigrationCategoryId>();
	private readonly refreshThrottler = this._register(new Throttler());
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => {
		void this.runPendingRefresh();
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

		// Prompt and user-data changes.
		this._register(promptsService.onDidChangeSlashCommands(() => this.scheduleRefresh([CustomizationMigrationCategoryId.PromptFiles])));
		this._register(Event.any(
			promptsService.onDidChangeCustomAgents,
			promptsService.onDidChangeInstructions,
			promptsService.onDidChangeAgentInstructions,
		)(() => this.scheduleRefresh([CustomizationMigrationCategoryId.UserData])));

		// Migration enablement changes.
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (CUSTOMIZATION_MIGRATION_CATEGORIES.some(category => category.enablementSetting && event.affectsConfiguration(category.enablementSetting))) {
				this.scheduleRefresh();
			}
		}));

		// Active session and working-directory changes.
		this._register(autorun(reader => {
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			const harnessId = this.harnessService.activeHarness.read(reader);
			const nextContextKey = `${harnessId}\n${getComparisonKey(sessionResource)}`;
			if (nextContextKey !== this.contextKey) {
				this.contextKey = nextContextKey;
				this.contextGeneration++;
				this._state.set(emptyMigrationState, undefined);
			}
			this.workingDirectoriesSignature = agentHostCustomizationService.getWorkingDirectories(sessionResource).join('\n');
			this.scheduleRefresh();
		}));
		this._register(agentHostCustomizationService.onDidChangeCustomizations(() => {
			const sessionResource = this.harnessService.activeSessionResource.get();
			const nextSignature = agentHostCustomizationService.getWorkingDirectories(sessionResource).join('\n');
			if (nextSignature !== this.workingDirectoriesSignature) {
				this.workingDirectoriesSignature = nextSignature;
				this.contextGeneration++;
				this.scheduleRefresh();
			}
		}));

		// MCP inventory changes.
		this._register(autorun(reader => {
			for (const server of mcpService.servers.read(reader)) {
				server.enablement.read(reader);
				server.readDefinitions().read(reader);
			}
			this.scheduleRefresh([CustomizationMigrationCategoryId.McpServers]);
		}));
	}

	async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		this.addPendingCategories(allMigrationCategoryIds);
		await this.runPendingRefresh();
	}

	private scheduleRefresh(categories = allMigrationCategoryIds): void {
		this.addPendingCategories(categories);
		this.refreshScheduler.schedule();
	}

	private addPendingCategories(categories: readonly CustomizationMigrationCategoryId[]): void {
		for (const category of categories) {
			this.pendingCategories.add(category);
		}
	}

	private runPendingRefresh(): Promise<void> {
		if (this.pendingCategories.size === 0) {
			return Promise.resolve();
		}

		return this.refreshThrottler.queue(async () => {
			if (this.pendingCategories.size === 0) {
				return;
			}
			const categoryIds = new Set(this.pendingCategories);
			this.pendingCategories.clear();
			await this.refreshCategories(categoryIds);
		});
	}

	private async refreshCategories(categoryIds: ReadonlySet<CustomizationMigrationCategoryId>): Promise<void> {
		// Capture one context snapshot so asynchronous work can reject results invalidated while it was running.
		const context: ICustomizationMigrationRefreshContext = {
			generation: this.contextGeneration,
			harnessId: this.harnessService.activeHarness.get(),
			sessionResource: this.harnessService.activeSessionResource.get(),
		};
		this._state.set({
			...this._state.get(),
			loading: categoryIds.size === allMigrationCategoryIds.length,
			loadError: undefined,
		}, undefined);

		if (!isAgentHostTarget(context.harnessId)) {
			this.setStateIfCurrent(context, emptyMigrationState);
			return;
		}

		try {
			const state = await this.computeRefreshState(context, categoryIds);
			if (state) {
				this.setStateIfCurrent(context, state);
			}
		} catch (error) {
			if (this.isCurrent(context)) {
				this._state.set({
					...this._state.get(),
					loading: false,
					loadError: getErrorMessage(error),
				}, undefined);
			}
			onUnexpectedError(error);
		}
	}

	private async computeRefreshState(
		context: ICustomizationMigrationRefreshContext,
		categoryIds: ReadonlySet<CustomizationMigrationCategoryId>,
	): Promise<ICustomizationMigrationModelState | undefined> {
		const enabledCategories = CUSTOMIZATION_MIGRATION_CATEGORIES.filter(category => this.isCategoryEnabled(category.id));
		if (enabledCategories.length === 0) {
			return emptyMigrationState;
		}

		const categoriesToRefresh = enabledCategories.filter(category => categoryIds.has(category.id));
		// Compute enabled categories together so the refresh publishes one consistent candidate snapshot.
		const migrationsByCategory: CustomizationMigrationCategoryCandidates[] = await Promise.all(categoriesToRefresh.map(async category => {
			const migration = category.migrationType === CustomizationMigrationType.McpServers
				? await this.migrationService.computeMigration(context.sessionResource, CustomizationMigrationType.McpServers)
				: await this.migrationService.computeMigration(context.sessionResource, category.migrationType);
			return [category.id, migration.candidates] as const;
		}));
		if (!this.isCurrent(context)) {
			return undefined;
		}

		// Preserve untouched enabled categories while replacing only those included in this partial refresh.
		const enabledCategoryIds = new Set(enabledCategories.map(category => category.id));
		const candidatesByCategory = new Map(
			[...this._state.get().candidatesByCategory].filter(([categoryId]) => enabledCategoryIds.has(categoryId))
		);
		for (const [categoryId, candidates] of migrationsByCategory) {
			candidatesByCategory.set(categoryId, candidates);
		}
		const refreshesFileCategories = categoriesToRefresh.some(category => category.migrationType !== CustomizationMigrationType.McpServers);
		const targetFoldersByType = refreshesFileCategories
			? await this.computeTargetFolders(context, candidatesByCategory)
			: this._state.get().targetFoldersByType;
		return {
			loading: false,
			candidatesByCategory,
			targetFoldersByType,
		};
	}

	private async computeTargetFolders(
		context: ICustomizationMigrationRefreshContext,
		candidatesByCategory: ReadonlyMap<CustomizationMigrationCategoryId, readonly CustomizationMigrationCandidate[]>,
	): Promise<ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>> {
		const provider = this.harnessService.findHarnessById(context.harnessId)?.itemProvider;
		const targetTypes = new Set([...candidatesByCategory.values()].flat()
			.filter(candidate => !isMcpServerCustomizationMigrationCandidate(candidate))
			.map(getCustomizationMigrationTargetType));
		const targetFolderEntries = await Promise.all([...targetTypes].map(async targetType => {
			const folders = await provider?.provideSourceFolders?.(context.sessionResource, targetType, CancellationToken.None);
			return [targetType, folders ?? []] as const;
		}));
		return new Map(targetFolderEntries);
	}

	isCategoryEnabled(categoryId: CustomizationMigrationCategoryId): boolean {
		const category = CUSTOMIZATION_MIGRATION_CATEGORIES.find(candidate => candidate.id === categoryId);
		return !!category && (!category.enablementSetting || this.configurationService.getValue<boolean>(category.enablementSetting) === true);
	}

	private setStateIfCurrent(
		context: ICustomizationMigrationRefreshContext,
		state: ICustomizationMigrationModelState,
	): void {
		if (this.isCurrent(context)) {
			this._state.set(state, undefined);
		}
	}

	private isCurrent(context: ICustomizationMigrationRefreshContext): boolean {
		return context.generation === this.contextGeneration
			&& context.harnessId === this.harnessService.activeHarness.get()
			&& isEqual(context.sessionResource, this.harnessService.activeSessionResource.get());
	}
}
