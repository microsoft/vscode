/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { Registry } from 'vs/platform/registry/common/platform';
import { TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ExternalTerminalContribution } from 'vs/workbench/contrib/externalTerminal/electron-sandbox/externalTerminal.contribution';
import { ITerminalBackendRegistry, ITerminalProfileResolverService, TerminalExtensions } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalNativeContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalNativeContribution';
import { ElectronTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalProfileResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LocalTerminalBackend } from 'vs/workbench/contrib/terminal/electron-sandbox/localTerminalBackend';

// Register services
registerSharedProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty, { supportsDelayedInstantiation: true });
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, true);

class LocalTerminalBackendContribution implements IWorkbenchContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).registerTerminalBackend(undefined, instantiationService.createInstance(LocalTerminalBackend));
	}
}

// Register
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(LocalTerminalBackendContribution, LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Ready);
workbenchRegistry.registerWorkbenchContribution(ExternalTerminalContribution, LifecyclePhase.Ready);
