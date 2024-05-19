/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebUtilsService } from 'vs/workbench/contrib/webUtils/browser/webUtils';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ElectronWebUtilsService } from 'vs/workbench/contrib/webUtils/electron-sandbox/webUtilsService';


registerSingleton(IWebUtilsService, ElectronWebUtilsService, InstantiationType.Delayed);
