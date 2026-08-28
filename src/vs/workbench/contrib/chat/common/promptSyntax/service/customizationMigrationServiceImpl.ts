/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { isAgentHostSessionResource } from '../../chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../customizationHarnessService.js';
import { getChatSessionType } from '../../model/chatUri.js';
import { PromptsType } from '../promptTypes.js';
import { IPromptsService } from './promptsService.js';
import { CustomizationMigration, CustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, MigratableConfiguration } from './customizationMigrationService.js';

export class CustomizationMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
	) { }

	async computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return { type, files: [], candidates: [] };
		}

		switch (type) {
			case CustomizationMigrationType.UserData: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
				])).flat();
				const candidates = customizations.filter(isUserDataMigrationCandidate);
				return this.createMigration(sessionResource, type, candidates);
			}
			case CustomizationMigrationType.PromptFiles: {
				const customizations = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
				const candidates = customizations.filter(isPromptFileMigrationCandidate);
				return this.createMigration(sessionResource, type, candidates);
			}
		}
	}

	private async createMigration(sessionResource: URI, type: CustomizationMigrationType, candidates: readonly MigratableConfiguration[]): Promise<CustomizationMigration> {
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.itemProvider;
		if (!provider?.provideSourceFolders) {
			return { type, files: [], candidates: [] };
		}

		const targetTypes = new Set(candidates.map(getCustomizationMigrationTargetType));
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		for (const targetType of targetTypes) {
			const folders = await provider.provideSourceFolders(sessionResource, targetType, CancellationToken.None);
			sourceFolders.set(targetType, folders ?? []);
		}
		const filteredCandidates = candidates.filter(customization => {
			const targetType = getCustomizationMigrationTargetType(customization);
			return sourceFolders.get(targetType)?.some(folder => folder.source === customization.storage) === true;
		});
		return { type, files: filteredCandidates.map(customization => customization.uri), candidates: filteredCandidates };
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
		]);
	}

	async computeMigrationHint(sessionResource: URI): Promise<string | undefined> {
		const migrations = await this.computeMigrations(sessionResource);
		const fileCount = migrations.reduce((total, migration) => total + migration.files.length, 0);
		if (fileCount === 0) {
			return undefined;
		}
		return fileCount === 1
			? localize('customizationMigrationHintSingle', "Found 1 customization file that is present but not used by Copilot and could be migrated.")
			: localize('customizationMigrationHintMultiple', "Found {0} customization files that are present but not used by Copilot and could be migrated.", fileCount);
	}
}
