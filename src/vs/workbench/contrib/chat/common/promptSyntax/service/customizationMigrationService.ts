/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { PromptsStorage } from './promptsService.js';

export const ICustomizationMigrationService = createDecorator<ICustomizationMigrationService>('customizationMigrationService');

export enum CustomizationMigrationType {
	UserData = 'userData',
	PromptFiles = 'promptFiles',
}

export interface MigratableConfiguration {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly storage: PromptsStorage;
	readonly name?: string;
	readonly description?: string;
	readonly source?: PromptFileSource;
}

export function getCustomizationMigrationTargetType(customization: MigratableConfiguration): PromptsType {
	return customization.type === PromptsType.prompt ? PromptsType.skill : customization.type;
}

export function isPromptFileMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.type === PromptsType.prompt
		&& (customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
}

export function isUserDataMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.source === PromptFileSource.UserData
		&& (customization.type === PromptsType.agent || customization.type === PromptsType.instructions);
}

export interface CustomizationMigration {
	readonly type: CustomizationMigrationType;
	readonly files: readonly URI[];
	readonly candidates: readonly MigratableConfiguration[];
}

export interface ICustomizationMigrationService {
	readonly _serviceBrand: undefined;

	computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration>;
	computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]>;
	computeMigrationHint(sessionResource: URI): Promise<string | undefined>;
}
