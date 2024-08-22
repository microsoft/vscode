/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions';
import { IExtHostOutputService, ExtHostOutputService } from './extHostOutput';
import { IExtHostWorkspace, ExtHostWorkspace } from './extHostWorkspace';
import { IExtHostDecorations, ExtHostDecorations } from './extHostDecorations';
import { IExtHostConfiguration, ExtHostConfiguration } from './extHostConfiguration';
import { IExtHostCommands, ExtHostCommands } from './extHostCommands';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';
import { IExtHostTerminalService, WorkerExtHostTerminalService } from './extHostTerminalService';
import { IExtHostTask, WorkerExtHostTask } from './extHostTask';
import { IExtHostDebugService, WorkerExtHostDebugService } from './extHostDebugService';
import { IExtHostSearch, ExtHostSearch } from './extHostSearch';
import { IExtHostStorage, ExtHostStorage } from './extHostStorage';
import { IExtHostTunnelService, ExtHostTunnelService } from './extHostTunnelService';
import { IExtHostApiDeprecationService, ExtHostApiDeprecationService, } from './extHostApiDeprecationService';
import { IExtHostWindow, ExtHostWindow } from './extHostWindow';
import { IExtHostConsumerFileSystem, ExtHostConsumerFileSystem } from './extHostFileSystemConsumer';
import { IExtHostFileSystemInfo, ExtHostFileSystemInfo } from './extHostFileSystemInfo';
import { IExtHostSecretState, ExtHostSecretState } from './extHostSecretState';
import { ExtHostTelemetry, IExtHostTelemetry } from './extHostTelemetry';
import { ExtHostEditorTabs, IExtHostEditorTabs } from './extHostEditorTabs';
import { ExtHostLoggerService } from './extHostLoggerService';
import { ILoggerService } from '../../../platform/log/common/log';
import { ExtHostVariableResolverProviderService, IExtHostVariableResolverProvider } from './extHostVariableResolverService';
import { ExtHostLocalizationService, IExtHostLocalizationService } from './extHostLocalizationService';
import { ExtHostManagedSockets, IExtHostManagedSockets } from './extHostManagedSockets';
import { ExtHostAuthentication, IExtHostAuthentication } from './extHostAuthentication';
import { ExtHostLanguageModels, IExtHostLanguageModels } from './extHostLanguageModels';
import { IExtHostTerminalShellIntegration, ExtHostTerminalShellIntegration } from './extHostTerminalShellIntegration';
import { ExtHostTesting, IExtHostTesting } from './extHostTesting';

registerSingleton(IExtHostLocalizationService, ExtHostLocalizationService, InstantiationType.Delayed);
registerSingleton(ILoggerService, ExtHostLoggerService, InstantiationType.Delayed);
registerSingleton(IExtHostApiDeprecationService, ExtHostApiDeprecationService, InstantiationType.Delayed);
registerSingleton(IExtHostCommands, ExtHostCommands, InstantiationType.Eager);
registerSingleton(IExtHostAuthentication, ExtHostAuthentication, InstantiationType.Eager);
registerSingleton(IExtHostLanguageModels, ExtHostLanguageModels, InstantiationType.Eager);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration, InstantiationType.Eager);
registerSingleton(IExtHostConsumerFileSystem, ExtHostConsumerFileSystem, InstantiationType.Eager);
registerSingleton(IExtHostTesting, ExtHostTesting, InstantiationType.Eager);
registerSingleton(IExtHostDebugService, WorkerExtHostDebugService, InstantiationType.Eager);
registerSingleton(IExtHostDecorations, ExtHostDecorations, InstantiationType.Eager);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors, InstantiationType.Eager);
registerSingleton(IExtHostManagedSockets, ExtHostManagedSockets, InstantiationType.Eager);
registerSingleton(IExtHostFileSystemInfo, ExtHostFileSystemInfo, InstantiationType.Eager);
registerSingleton(IExtHostOutputService, ExtHostOutputService, InstantiationType.Delayed);
registerSingleton(IExtHostSearch, ExtHostSearch, InstantiationType.Eager);
registerSingleton(IExtHostStorage, ExtHostStorage, InstantiationType.Eager);
registerSingleton(IExtHostTask, WorkerExtHostTask, InstantiationType.Eager);
registerSingleton(IExtHostTerminalService, WorkerExtHostTerminalService, InstantiationType.Eager);
registerSingleton(IExtHostTerminalShellIntegration, ExtHostTerminalShellIntegration, InstantiationType.Eager);
registerSingleton(IExtHostTunnelService, ExtHostTunnelService, InstantiationType.Eager);
registerSingleton(IExtHostWindow, ExtHostWindow, InstantiationType.Eager);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace, InstantiationType.Eager);
registerSingleton(IExtHostSecretState, ExtHostSecretState, InstantiationType.Eager);
registerSingleton(IExtHostTelemetry, ExtHostTelemetry, InstantiationType.Eager);
registerSingleton(IExtHostEditorTabs, ExtHostEditorTabs, InstantiationType.Eager);
registerSingleton(IExtHostVariableResolverProvider, ExtHostVariableResolverProviderService, InstantiationType.Eager);
