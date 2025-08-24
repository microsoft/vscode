/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewFolderFlowStep } from './newFolderFlowEnums.js';
import { FolderTemplateStep } from '../components/steps/folderTemplateStep.js';
import { RConfigurationStep } from '../components/steps/rConfigurationStep.js';
import { PythonEnvironmentStep } from '../components/steps/pythonEnvironmentStep.js';
import { FolderNameLocationStep } from '../components/steps/folderNameLocationStep.js';

export const NewFolderFlowStepLookup = {
	[NewFolderFlowStep.None]: () => null,
	[NewFolderFlowStep.FolderTemplateSelection]: FolderTemplateStep,
	[NewFolderFlowStep.FolderNameLocation]: FolderNameLocationStep,
	[NewFolderFlowStep.PythonEnvironment]: PythonEnvironmentStep,
	[NewFolderFlowStep.RConfiguration]: RConfigurationStep
};
