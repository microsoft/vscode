/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
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
