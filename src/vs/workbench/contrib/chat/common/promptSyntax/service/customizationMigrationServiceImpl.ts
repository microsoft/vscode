/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isAgentHostTarget } from '../../chatSessionsService.js';
import { PromptsType } from '../promptTypes.js';
import { IPromptsService } from './promptsService.js';
import { CustomizationMigration, CustomizationMigrationType, ICustomizationMigrationService, isPromptFileMigrationCandidate, isUserDataMigrationCandidate } from './customizationMigrationService.js';

export class CustomizationMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) { }

	async computeMigration(sessionType: string, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		if (!isAgentHostTarget(sessionType)) {
			return { type, files: [], candidates: [] };
		}

		switch (type) {
			case CustomizationMigrationType.UserData: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
				])).flat();
				const candidates = customizations.filter(isUserDataMigrationCandidate);
				return { type, files: candidates.map(customization => customization.uri), candidates };
			}
			case CustomizationMigrationType.PromptFiles: {
				const customizations = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
				const candidates = customizations.filter(isPromptFileMigrationCandidate);
				return { type, files: candidates.map(customization => customization.uri), candidates };
			}
		}
	}

	async computeMigrations(sessionType: string): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionType, CustomizationMigrationType.UserData),
			this.computeMigration(sessionType, CustomizationMigrationType.PromptFiles),
		]);
	}
}
