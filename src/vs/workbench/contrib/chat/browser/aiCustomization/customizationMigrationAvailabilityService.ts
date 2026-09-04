/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { CustomizationMigrationType, ICustomizationMigrationService } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';

export const ICustomizationMigrationAvailabilityService = createDecorator<ICustomizationMigrationAvailabilityService>('customizationMigrationAvailabilityService');

export interface ICustomizationMigrationAvailabilityService {
	readonly _serviceBrand: undefined;
	readonly candidateCount: IObservable<number>;
}

class CustomizationMigrationAvailabilityService extends Disposable implements ICustomizationMigrationAvailabilityService {
	declare readonly _serviceBrand: undefined;

	private readonly candidateCountValue = observableValue(this, 0);
	readonly candidateCount = this.candidateCountValue;
	private refreshSequence = 0;
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => void this.refresh(), 0));

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.harnessService.availableHarnesses.read(reader);
			this.scheduleRefresh();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (CUSTOMIZATION_MIGRATION_CATEGORIES.some(category => event.affectsConfiguration(category.enablementSetting))) {
				this.scheduleRefresh();
			}
		}));
		this._register(Event.any(
			this.harnessService.onDidChangeSlashCommands,
			this.harnessService.onDidChangeCustomAgents,
			this.promptsService.onDidChangeInstructions,
		)(() => this.scheduleRefresh()));
	}

	private scheduleRefresh(): void {
		this.refreshSequence++;
		this.refreshScheduler.schedule();
	}

	private async refresh(): Promise<void> {
		const refreshSequence = ++this.refreshSequence;
		const activeHarness = this.harnessService.activeHarness.get();
		const activeSessionResource = this.harnessService.activeSessionResource.get();
		if (!isAgentHostTarget(activeHarness) || !activeSessionResource) {
			this.candidateCountValue.set(0, undefined);
			return;
		}

		const categories = CUSTOMIZATION_MIGRATION_CATEGORIES.filter(category => this.configurationService.getValue<boolean>(category.enablementSetting));
		if (categories.length === 0) {
			this.candidateCountValue.set(0, undefined);
			return;
		}

		try {
			const migrations = await Promise.all(categories.map(category => this.migrationService.computeMigration(
				activeSessionResource,
				category.id === CustomizationMigrationCategoryId.PromptFiles
					? CustomizationMigrationType.PromptFiles
					: CustomizationMigrationType.UserData,
			)));
			if (refreshSequence !== this.refreshSequence || activeHarness !== this.harnessService.activeHarness.get() || !isEqual(activeSessionResource, this.harnessService.activeSessionResource.get())) {
				return;
			}
			const count = migrations.reduce((total, migration) => total + migration.files.length, 0);
			this.candidateCountValue.set(count, undefined);
		} catch (error) {
			if (refreshSequence === this.refreshSequence) {
				this.candidateCountValue.set(0, undefined);
			}
			this.logService.error('Failed to assess customization migrations', error);
		}
	}
}

registerSingleton(ICustomizationMigrationAvailabilityService, CustomizationMigrationAvailabilityService, InstantiationType.Delayed);
