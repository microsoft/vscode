/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ICustomizationMigrationIgnoredGroup } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory, homepageMigrationCategories } from './customizationMigrationCategories.js';

export const CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY = 'chat.customizationMigration.ignoredGroups';

interface IIgnoredMigrationGroupsState {
	readonly groupKeys: readonly string[];
}

export function getCustomizationMigrationGroupIgnoreKey(
	harness: string,
	id: CustomizationMigrationCategoryId,
	storage: PromptsStorage,
	project: URI | undefined,
): string {
	if (storage === PromptsStorage.user) {
		return `${harness}:${storage}:${id}`;
	}
	return `${harness}:${storage}:${project ? getComparisonKey(project) : ''}:${id}`;
}

export function getIgnoredCustomizationMigrationGroupKeys(storageService: IStorageService): Set<string> {
	return new Set(storageService.getObject<IIgnoredMigrationGroupsState>(
		CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY,
		StorageScope.PROFILE,
		{ groupKeys: [] },
	).groupKeys);
}

export function storeIgnoredCustomizationMigrationGroupKeys(storageService: IStorageService, groupKeys: Set<string>): void {
	storageService.store(
		CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY,
		{ groupKeys: [...groupKeys] },
		StorageScope.PROFILE,
		StorageTarget.MACHINE,
	);
}

export function getIgnoredCustomizationMigrationGroups(
	storageService: IStorageService,
	harness: string,
	project: URI | undefined,
): readonly ICustomizationMigrationIgnoredGroup[] {
	const ignoredKeys = getIgnoredCustomizationMigrationGroupKeys(storageService);
	const storages = project ? [PromptsStorage.user, PromptsStorage.local] : [PromptsStorage.user];
	return storages.flatMap(storage => homepageMigrationCategories.flatMap(id =>
		ignoredKeys.has(getCustomizationMigrationGroupIgnoreKey(harness, id, storage, project))
			? [{ type: getCustomizationMigrationCategory(id).migrationType, storage }]
			: []
	));
}
