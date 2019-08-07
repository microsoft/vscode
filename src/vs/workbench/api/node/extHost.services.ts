/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { ExtHostOutputService2 } from 'vs/workbench/api/node/extHostOutputService';
import { IExtHostWorkspace, ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostDecorations, ExtHostDecorations } from 'vs/workbench/api/common/extHostDecorations';
import { IExtHostConfiguration, ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IExtHostCommands, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostTerminalService } from 'vs/workbench/api/node/extHostTerminalService';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';

// register singleton services
registerSingleton(IExtHostOutputService, ExtHostOutputService2);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace);
registerSingleton(IExtHostDecorations, ExtHostDecorations);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration);
registerSingleton(IExtHostCommands, ExtHostCommands);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors);
registerSingleton(IExtHostTerminalService, ExtHostTerminalService);
