/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IExtHostOutputService, ExtHostOutputService } from './extHostOutput.js';
import { IExtHostWorkspace, ExtHostWorkspace } from './extHostWorkspace.js';
import { IExtHostDecorations, ExtHostDecorations } from './extHostDecorations.js';
import { IExtHostConfiguration, ExtHostConfiguration } from './extHostConfiguration.js';
import { IExtHostCommands, ExtHostCommands } from './extHostCommands.js';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostTerminalService, WorkerExtHostTerminalService } from './extHostTerminalService.js';
import { IExtHostTask, WorkerExtHostTask } from './extHostTask.js';
import { IExtHostDebugService, WorkerExtHostDebugService } from './extHostDebugService.js';
import { IExtHostSearch, ExtHostSearch } from './extHostSearch.js';
import { IExtHostStorage, ExtHostStorage } from './extHostStorage.js';
import { IExtHostTunnelService, ExtHostTunnelService } from './extHostTunnelService.js';
import { IExtHostApiDeprecationService, ExtHostApiDeprecationService, } from './extHostApiDeprecationService.js';
import { IExtHostWindow, ExtHostWindow } from './extHostWindow.js';
import { IExtHostConsumerFileSystem, ExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { IExtHostFileSystemInfo, ExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { IExtHostSecretState, ExtHostSecretState } from './extHostSecretState.js';
import { ExtHostEditorTabs, IExtHostEditorTabs } from './extHostEditorTabs.js';
import { ExtHostLoggerService } from './extHostLoggerService.js';
import { ILoggerService } from '../../../platform/log/common/log.js';
import { ExtHostVariableResolverProviderService, IExtHostVariableResolverProvider } from './extHostVariableResolverService.js';
import { ExtHostLocalizationService, IExtHostLocalizationService } from './extHostLocalizationService.js';
import { ExtHostManagedSockets, IExtHostManagedSockets } from './extHostManagedSockets.js';
import { ExtHostAuthentication, IExtHostAuthentication } from './extHostAuthentication.js';
import { ExtHostLanguageModels, IExtHostLanguageModels } from './extHostLanguageModels.js';
import { IExtHostTerminalShellIntegration, ExtHostTerminalShellIntegration } from './extHostTerminalShellIntegration.js';
import { ExtHostTesting, IExtHostTesting } from './extHostTesting.js';

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
registerSingleton(IExtHostEditorTabs, ExtHostEditorTabs, InstantiationType.Eager);
registerSingleton(IExtHostVariableResolverProvider, ExtHostVariableResolverProviderService, InstantiationType.Eager);
