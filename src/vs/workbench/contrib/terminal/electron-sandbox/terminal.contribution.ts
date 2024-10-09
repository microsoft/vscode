/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILocalPtyService, TerminalIpcChannels } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITerminalProfileResolverService, TerminalCommandId } from '../common/terminal.js';
import { TerminalNativeContribution } from './terminalNativeContribution.js';
import { ElectronTerminalProfileResolverService } from './terminalProfileResolverService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { LocalTerminalBackendContribution } from './localTerminalBackend.js';
import { registerContextualInstanceAction } from '../browser/terminalActions.js';
import { localize2 } from '../../../../nls.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';

// Register services
registerMainProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, InstantiationType.Delayed);

// Register workbench contributions
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

// This contribution needs to be active during the Startup phase to be available when a remote resolver tries to open a local
// terminal while connecting to the remote.
registerWorkbenchContribution2(LocalTerminalBackendContribution.ID, LocalTerminalBackendContribution, WorkbenchPhase.BlockStartup);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Restored);

registerContextualInstanceAction({
	id: TerminalCommandId.RevealInFinder,
	title: localize2('workbench.action.terminal.revealInFinder', 'Reveal in Finder'),
	run: async (instance, c, accessor) => {
		const nativeHostService = accessor.get(INativeHostService);
		// TODO: cwd is empty when the terminal is restore from editor.
		// const cwd = instance.cwd || instance.initialCwd;
		const cwd = instance.cwd;
		if (cwd) {
			const uri = URI.file(cwd);
			nativeHostService.showItemInFolder(uri.fsPath);
		}
	}
});
registerContextualInstanceAction({
	id: TerminalCommandId.RevealInExplorer,
	title: localize2('workbench.action.terminal.revealInExplorer', 'Reveal in Explorer'),
	run: async (instance, c, accessor) => {
		const commandService = accessor.get(ICommandService);
		if (instance.cwd) {
			const uri = URI.file(instance.cwd);
			commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
		}
	}
});
registerContextualInstanceAction({
	id: TerminalCommandId.OpenInExternalTerminal,
	title: localize2('workbench.action.terminal.openInExternalTerminal', 'Open in External Terminal'),
	run: (instance, c, accessor) => {
		const commandService = accessor.get(ICommandService);
		if (instance.cwd) {
			const uri = URI.file(instance.cwd);
			commandService.executeCommand('openInTerminal', uri);
		}
	}
});
