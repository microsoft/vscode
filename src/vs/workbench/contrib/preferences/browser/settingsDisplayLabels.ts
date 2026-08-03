/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNLSModuleTranslations } from '../../../../nls.js';

// Keep this in sync with the module id used by the NLS extraction in src/vs/base/node/nls.ts.
const MODULE_ID = 'vs/workbench/contrib/preferences/browser/settingsDisplayLabels';

function getModuleTranslations(): Record<string, string> {
	return getNLSModuleTranslations(MODULE_ID);
}

function readOverride(key: string): string | undefined {
	const value = getModuleTranslations()[key]?.trim();
	return value || undefined;
}

/**
 * Optional category label override from the language pack (`settingDisplayCategory.{categoryPath}`).
 * The language pack supplies the full string to display.
 */
export function getSettingDisplayCategoryOverride(settingKey: string): string | undefined {
	if (!settingKey.includes('.')) {
		return undefined;
	}

	const categoryPath = settingKey.substring(0, settingKey.lastIndexOf('.'));
	for (const path of [categoryPath, categoryPath.split('.')[0]]) {
		const value = readOverride(`settingDisplayCategory.${path}`);
		if (value) {
			return value;
		}
	}

	return undefined;
}

/**
 * Optional setting label override from the language pack (`settingDisplay.{settingKey}`).
 * The language pack supplies the full string to display.
 */
export function getSettingDisplayLabelOverride(settingKey: string): string | undefined {
	return readOverride(`settingDisplay.${settingKey}`);
}

/**
 * Optional enum label override from the language pack (`settingDisplayEnum.{settingKey}.{enumValue}`).
 */
export function getSettingEnumDisplayLabelOverride(settingKey: string, enumValue: string): string | undefined {
	return readOverride(`settingDisplayEnum.${settingKey}.${enumValue}`);
}
