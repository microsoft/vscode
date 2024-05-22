/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as nls from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILocalPtyService, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IViewsRegistry, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/terminal/browser/terminal.contribution.js';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal.js';
import { terminalViewIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { ITerminalProfileResolverService, TERMINAL_VIEW_ID, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { LocalTerminalBackendContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/localTerminalBackend';
import { ElectronTerminalInstanceService } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalInstanceService.js';
import { TerminalNativeContribution } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalNativeContribution';
import { ElectronTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalProfileResolverService';
import { ElectronTerminalViewPane } from 'vs/workbench/contrib/terminal/electron-sandbox/terminalView.js';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';



// Register services
registerMainProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, InstantiationType.Delayed);

// Register workbench contributions
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

// This contribution needs to be active during the Startup phase to be available when a remote resolver tries to open a local
// terminal while connecting to the remote.
registerWorkbenchContribution2(LocalTerminalBackendContribution.ID, LocalTerminalBackendContribution, WorkbenchPhase.BlockStartup);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Restored);


registerSingleton(ITerminalInstanceService, ElectronTerminalInstanceService, InstantiationType.Delayed);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: TERMINAL_VIEW_ID,
	name: nls.localize2('terminal', "Terminal"),
	containerIcon: terminalViewIcon,
	canToggleVisibility: false,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(ElectronTerminalViewPane),
	openCommandActionDescriptor: {
		id: TerminalCommandId.Toggle,
		mnemonicTitle: nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyCode.Backquote,
			mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote }
		},
		order: 3
	}
}], VIEW_CONTAINER);
