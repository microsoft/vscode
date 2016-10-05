/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerContributions } from 'vs/workbench/parts/markers/browser/markersWorkbenchContributions';
import { registerContributions as registerElectronContributions } from 'vs/workbench/parts/markers/electron-browser/markersElectronContributions';

registerContributions();
registerElectronContributions();