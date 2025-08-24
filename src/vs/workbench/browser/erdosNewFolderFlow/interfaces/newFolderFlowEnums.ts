/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum NewFolderFlowStep {
	None = 'none',
	FolderTemplateSelection = 'folderTemplateSelection',
	FolderNameLocation = 'folderNameLocation',
	PythonEnvironment = 'pythonEnvironment',
	RConfiguration = 'rConfiguration'
}

export enum EnvironmentSetupType {
	NewEnvironment = 'newEnvironment',
	ExistingEnvironment = 'existingEnvironment'
}

export enum PythonEnvironmentProvider {
	Venv = 'Venv',
	Conda = 'Conda',
	Uv = 'uv'
}
