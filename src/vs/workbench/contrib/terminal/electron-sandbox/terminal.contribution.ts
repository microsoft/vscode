/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILocalTerminalService, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LocalTerminalService } from 'vs/workbench/contrib/terminal/electron-sandbox/localTerminalService';
import { TerminalNativeContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalNativeContribution';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

registerSharedProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty, { supportsDelayedInstantiation: true });

registerSingleton(ILocalTerminalService, LocalTerminalService, true);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Ready);
