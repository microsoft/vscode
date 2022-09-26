/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { Registry } from 'vs/platform/registry/common/platform';
import { TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ITerminalProfileResolverService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalNativeContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalNativeContribution';
import { ElectronTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalProfileResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { LocalTerminalBackendContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/localTerminalBackend';

// Register services
registerSharedProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, true);

// Register workbench contributions
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(LocalTerminalBackendContribution, 'LocalTerminalBackendContribution', LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, 'TerminalNativeContribution', LifecyclePhase.Restored);
