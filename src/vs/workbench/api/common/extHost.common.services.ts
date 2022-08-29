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
import { IExtHostStorage, ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { IExtHostTunnelService, ExtHostTunnelService } from 'vs/workbench/api/common/extHostTunnelService';
import { IExtHostApiDeprecationService, ExtHostApiDeprecationService, } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { IExtHostWindow, ExtHostWindow } from 'vs/workbench/api/common/extHostWindow';
import { IExtHostConsumerFileSystem, ExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { IExtHostFileSystemInfo, ExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { IExtHostSecretState, ExtHostSecretState } from 'vs/workbench/api/common/extHostSecretState';
import { ExtHostTelemetry, IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { ExtHostEditorTabs, IExtHostEditorTabs } from 'vs/workbench/api/common/extHostEditorTabs';
import { ExtHostLoggerService } from 'vs/workbench/api/common/extHostLoggerService';
import { ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { ExtHostLogService } from 'vs/workbench/api/common/extHostLogService';
import { ExtHostVariableResolverProviderService, IExtHostVariableResolverProvider } from 'vs/workbench/api/common/extHostVariableResolverService';
import { ExtHostTelemetryLogService, IExtHostTelemetryLogService } from 'vs/workbench/api/common/extHostTelemetryLogService';

registerSingleton(ILoggerService, ExtHostLoggerService, false);
registerSingleton(ILogService, ExtHostLogService, false);
registerSingleton(IExtHostApiDeprecationService, ExtHostApiDeprecationService, false);
registerSingleton(IExtHostCommands, ExtHostCommands, false);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration, false);
registerSingleton(IExtHostConsumerFileSystem, ExtHostConsumerFileSystem, false);
registerSingleton(IExtHostDebugService, WorkerExtHostDebugService, false);
registerSingleton(IExtHostDecorations, ExtHostDecorations, false);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors, false);
registerSingleton(IExtHostFileSystemInfo, ExtHostFileSystemInfo, false);
registerSingleton(IExtHostOutputService, ExtHostOutputService, false);
registerSingleton(IExtHostSearch, ExtHostSearch, false);
registerSingleton(IExtHostStorage, ExtHostStorage, false);
registerSingleton(IExtHostTask, WorkerExtHostTask, false);
registerSingleton(IExtHostTerminalService, WorkerExtHostTerminalService, false);
registerSingleton(IExtHostTunnelService, ExtHostTunnelService, false);
registerSingleton(IExtHostWindow, ExtHostWindow, false);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace, false);
registerSingleton(IExtHostSecretState, ExtHostSecretState, false);
registerSingleton(IExtHostTelemetry, ExtHostTelemetry, false);
registerSingleton(IExtHostTelemetryLogService, ExtHostTelemetryLogService, false);
registerSingleton(IExtHostEditorTabs, ExtHostEditorTabs, false);
registerSingleton(IExtHostVariableResolverProvider, ExtHostVariableResolverProviderService, false);
