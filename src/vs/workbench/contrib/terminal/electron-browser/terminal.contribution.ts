/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILocalPtyService, TerminalIpcChannels } from '../../../../platform/terminal/common/terminal.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import { TerminalNativeContribution } from './terminalNativeContribution.js';
import { ElectronTerminalProfileResolverService } from './terminalProfileResolverService.js';
import { LocalTerminalBackendContribution } from './localTerminalBackend.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { InstallShellScriptWithCopilotAction, registerInstallShellScriptWithCopilotMenu } from './terminalInstallActions.js';

// Register services
registerMainProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, InstantiationType.Delayed);

// Register workbench contributions

// This contribution needs to be active during the Startup phase to be available when a remote resolver tries to open a local
// terminal while connecting to the remote.
registerWorkbenchContribution2(LocalTerminalBackendContribution.ID, LocalTerminalBackendContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(TerminalNativeContribution.ID, TerminalNativeContribution, WorkbenchPhase.AfterRestored);

if (isMacintosh) {
	registerAction2(InstallShellScriptWithCopilotAction);
	registerInstallShellScriptWithCopilotMenu();
}
