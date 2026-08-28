/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { IPromptPath, PromptsStorage } from './promptsService.js';

export const ICustomizationMigrationService = createDecorator<ICustomizationMigrationService>('customizationMigrationService');

export enum CustomizationMigrationType {
	UserData = 'userData',
	PromptFiles = 'promptFiles',
}

export function isPromptFileMigrationCandidate(customization: IPromptPath): boolean {
	return customization.type === PromptsType.prompt
		&& (customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
}

export function isUserDataMigrationCandidate(customization: IPromptPath): boolean {
	return customization.source === PromptFileSource.UserData
		&& (customization.type === PromptsType.agent || customization.type === PromptsType.instructions);
}

export interface CustomizationMigration {
	readonly type: CustomizationMigrationType;
	readonly files: readonly URI[];
	readonly candidates: readonly IPromptPath[];
}

export interface ICustomizationMigrationService {
	readonly _serviceBrand: undefined;

	computeMigration(sessionType: string, type: CustomizationMigrationType): Promise<CustomizationMigration>;
	computeMigrations(sessionType: string): Promise<CustomizationMigration[]>;
}
