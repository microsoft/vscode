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
import { IExtHostTask } from 'vs/workbench/api/common/extHostTask';
import { ExtHostTask } from 'vs/workbench/api/node/extHostTask';
import { ExtHostDebugService } from 'vs/workbench/api/node/extHostDebugService';
import { IExtHostDebugService } from 'vs/workbench/api/common/extHostDebugService';
import { IExtHostSearch } from 'vs/workbench/api/common/extHostSearch';
import { ExtHostSearch } from 'vs/workbench/api/node/extHostSearch';
import { ExtensionStoragePaths } from 'vs/workbench/api/node/extHostStoragePaths';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { IExtHostStorage, ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';

// register singleton services
registerSingleton(ILogService, ExtHostLogService);
registerSingleton(IExtHostOutputService, ExtHostOutputService2);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace);
registerSingleton(IExtHostDecorations, ExtHostDecorations);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration);
registerSingleton(IExtHostCommands, ExtHostCommands);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors);
registerSingleton(IExtHostTerminalService, ExtHostTerminalService);
registerSingleton(IExtHostTask, ExtHostTask);
registerSingleton(IExtHostDebugService, ExtHostDebugService);
registerSingleton(IExtHostSearch, ExtHostSearch);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths);
registerSingleton(IExtHostExtensionService, ExtHostExtensionService);
registerSingleton(IExtHostStorage, ExtHostStorage);
