/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtHostOutputService, ExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { IExtHostWorkspace, ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostDecorations, ExtHostDecorations } from 'vs/workbench/api/common/extHostDecorations';
import { IExtHostConfiguration, ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IExtHostCommands, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostTerminalService, WorkerExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostTask, WorkerExtHostTask } from 'vs/workbench/api/common/extHostTask';
import { IExtHostDebugService, WorkerExtHostDebugService } from 'vs/workbench/api/common/extHostDebugService';
import { IExtHostSearch, ExtHostSearch } from 'vs/workbench/api/common/extHostSearch';
import { IExtensionStoragePaths, ExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { IExtHostStorage, ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { ExtHostExtensionService } from 'vs/workbench/api/worker/extHostExtensionService';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLogService } from 'vs/workbench/api/worker/extHostLogService';
import { IExtHostTunnelService, ExtHostTunnelService } from 'vs/workbench/api/common/extHostTunnelService';
import { IExtHostApiDeprecationService, ExtHostApiDeprecationService, } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { IExtHostWindow, ExtHostWindow } from 'vs/workbench/api/common/extHostWindow';
import { ExtHostConsumerFileSystem, IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';

// register singleton services
registerSingleton(ILogService, ExtHostLogService);
registerSingleton(IExtHostApiDeprecationService, ExtHostApiDeprecationService);
registerSingleton(IExtHostOutputService, ExtHostOutputService);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace);
registerSingleton(IExtHostWindow, ExtHostWindow);
registerSingleton(IExtHostDecorations, ExtHostDecorations);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration);
registerSingleton(IExtHostCommands, ExtHostCommands);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors);
registerSingleton(IExtHostStorage, ExtHostStorage);
registerSingleton(IExtHostExtensionService, ExtHostExtensionService);
registerSingleton(IExtHostSearch, ExtHostSearch);
registerSingleton(IExtHostTunnelService, ExtHostTunnelService);
registerSingleton(IExtHostConsumerFileSystem, ExtHostConsumerFileSystem);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths);

registerSingleton(IExtHostTerminalService, WorkerExtHostTerminalService);
registerSingleton(IExtHostTask, WorkerExtHostTask);
registerSingleton(IExtHostDebugService, WorkerExtHostDebugService);
