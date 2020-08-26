/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { ExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/browser/extensionsWorkbenchService';

// TODO@sandbox TODO@ben move back into common/extensions.contribution.ts when 'semver-umd' can be loaded
registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService);
