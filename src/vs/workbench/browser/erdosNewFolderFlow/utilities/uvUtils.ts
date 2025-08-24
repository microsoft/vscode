/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DropDownListBoxItem } from '../../erdosComponents/dropDownListBox/dropDownListBoxItem.js';
import { PythonEnvironmentProvider } from '../interfaces/newFolderFlowEnums.js';
import { InterpreterInfo } from './interpreterDropDownUtils.js';

export interface UvPythonVersionInfo {
	versions: string[];
}

export const EMPTY_UV_PYTHON_VERSION_INFO: UvPythonVersionInfo = {
	versions: [],
};

export const uvInterpretersToDropdownItems = (
	versionInfo: UvPythonVersionInfo | undefined
) => {
	if (!versionInfo) {
		return [];
	}
	return versionInfo.versions.map(
		(version: string) =>
			new DropDownListBoxItem<string, InterpreterInfo>({
				identifier: version,
				value: {
					preferred: false,
					runtimeId: version,
					languageName: 'Python',
					languageVersion: version,
					runtimePath: '',
					runtimeSource: PythonEnvironmentProvider.Uv,
				},
			})
	);
};
