/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationKeyValuePairs, ConfigurationMigration } from '../../../../workbench/common/configuration.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';

export const LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING = 'chat.agentSessions.consolidatedRemoteWorkspaces';

export const unifiedWorkspacePickerConfigurationMigration: ConfigurationMigration = {
	key: LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING,
	includeApplication: true,
	migrateFn: (value, accessor) => {
		const pairs: ConfigurationKeyValuePairs = [[LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, { value: undefined }]];
		if (accessor(UNIFIED_WORKSPACE_PICKER_SETTING) === undefined) {
			pairs.push([UNIFIED_WORKSPACE_PICKER_SETTING, { value }]);
		}
		return pairs;
	},
};
