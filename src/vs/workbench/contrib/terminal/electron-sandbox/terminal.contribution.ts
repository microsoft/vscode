/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services';
import { Registry } from '../../../../platform/registry/common/platform';
import { ILocalPtyService, TerminalIpcChannels } from '../../../../platform/terminal/common/terminal';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions';
import { ITerminalProfileResolverService } from '../common/terminal';
import { TerminalNativeContribution } from './terminalNativeContribution';
import { ElectronTerminalProfileResolverService } from './terminalProfileResolverService';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { LocalTerminalBackendContribution } from './localTerminalBackend';

// Register services
registerMainProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, InstantiationType.Delayed);

// Register workbench contributions
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

// This contribution needs to be active during the Startup phase to be available when a remote resolver tries to open a local
// terminal while connecting to the remote.
registerWorkbenchContribution2(LocalTerminalBackendContribution.ID, LocalTerminalBackendContribution, WorkbenchPhase.BlockStartup);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Restored);
