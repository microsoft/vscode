/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import platform = require('vs/platform/platform');
import { ExtensionOutputHandler } from 'vs/workbench/parts/debug/electron-browser/extensionOutput';

// Register Extension Output Handler
(<IWorkbenchContributionsRegistry>platform.Registry.as(Extensions.Workbench)).registerWorkbenchContribution(
	ExtensionOutputHandler
);