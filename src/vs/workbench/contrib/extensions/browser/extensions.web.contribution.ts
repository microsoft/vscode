/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionTipsService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionTipsService } from 'vs/workbench/contrib/extensions/browser/extensionTipsService';

// Singletons
registerSingleton(IExtensionTipsService, ExtensionTipsService);
