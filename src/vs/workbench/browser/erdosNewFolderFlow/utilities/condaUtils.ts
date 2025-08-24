/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DropDownListBoxItem } from '../../erdosComponents/dropDownListBox/dropDownListBoxItem.js';
import { PythonEnvironmentProvider } from '../interfaces/newFolderFlowEnums.js';
import { InterpreterInfo } from './interpreterDropDownUtils.js';

export interface CondaPythonVersionInfo {
	preferred: string;
	versions: string[];
}

export const EMPTY_CONDA_PYTHON_VERSION_INFO: CondaPythonVersionInfo = {
	preferred: '',
	versions: [],
};

export const condaInterpretersToDropdownItems = (
	versionInfo: CondaPythonVersionInfo | undefined
) => {
	if (!versionInfo) {
		return [];
	}
	return versionInfo.versions.map(
		(version: string) =>
			new DropDownListBoxItem<string, InterpreterInfo>({
				identifier: version,
				value: {
					preferred: version === versionInfo.preferred,
					runtimeId: version,
					languageName: 'Python',
					languageVersion: version,
					runtimePath: '',
					runtimeSource: PythonEnvironmentProvider.Conda,
				},
			})
	);
};
