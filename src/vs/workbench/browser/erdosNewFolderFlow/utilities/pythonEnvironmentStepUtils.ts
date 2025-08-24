/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DropDownListBoxItem } from '../../erdosComponents/dropDownListBox/dropDownListBoxItem.js';
import { PythonEnvironmentProvider } from '../interfaces/newFolderFlowEnums.js';

export interface PythonEnvironmentProviderInfo {
	id: string;
	name: string;
	description: string;
}

export const locationForNewEnv = (
	parentFolder: string,
	projectName: string,
	envProviderName: string | undefined,
) => {
	const envDir =
		envProviderName === PythonEnvironmentProvider.Conda
			? '.conda'
			: '.venv';
	return [parentFolder, projectName, envDir];
};

export const envProviderInfoToDropDownItems = (
	providers: PythonEnvironmentProviderInfo[]
): DropDownListBoxItem<string, PythonEnvironmentProviderInfo>[] => {
	return providers.map(
		(provider) =>
			new DropDownListBoxItem<string, PythonEnvironmentProviderInfo>({
				identifier: provider.id,
				value: provider,
			})
	);
};

export const envProviderNameForId = (
	providerId: string | undefined,
	providers: PythonEnvironmentProviderInfo[]
): string | undefined => {
	if (!providerId) {
		return undefined;
	}
	const provider = providers.find((p) => p.id === providerId);
	return provider ? provider.name : undefined;
};
