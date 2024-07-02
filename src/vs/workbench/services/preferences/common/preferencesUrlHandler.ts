/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IURLHandler } from 'vs/platform/url/common/url';
import { IOpenSettingsOptions, IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export const SettingsAuthority = 'settings';

export class PreferencesUrlHandler implements IURLHandler {
	constructor(
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) { }

	/**
	 * Should be of the format:
	 * 	vscode://settings/settingName/optionalSettingValue
	 * Examples:
	 * 	vscode://settings/files.autoSave/afterDelay
	 * 	vscode://settings/files.autoSave
	 *
	 * The optionalSettingValue is not currently used.
	 */
	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== SettingsAuthority) {
			return false;
		}

		const openSettingsOptions: IOpenSettingsOptions = {};
		const settingInfo = uri.path.split('/').filter(part => !!part);
		if (settingInfo.length === 0) {
			return false;
		}
		openSettingsOptions.query = settingInfo[0];

		this.preferencesService.openSettings(openSettingsOptions);
		return true;
	}
}
