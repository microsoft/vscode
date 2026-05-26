/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { IProcessStateProtocolMainService, PSP_MAIN_CHANNEL_NAME } from '../../../../platform/processStateProtocol/common/protocol.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { IProcessStateProtocolService } from '../common/processStateProtocolService.js';
import { OPEN_PSP_SESSION_BY_TERMINAL_COMMAND_ID, OPEN_PSP_SESSION_COMMAND_ID } from './pspCommands.js';
import { ProcessStateProtocolService } from './processStateProtocolService.js';
import { sessionUri } from './pspFileSystemProvider.js';

// Renderer-side proxy that talks to the main-process hub over IPC.
registerMainProcessRemoteService(IProcessStateProtocolMainService, PSP_MAIN_CHANNEL_NAME);

registerSingleton(IProcessStateProtocolService, ProcessStateProtocolService, InstantiationType.Delayed);

// Force the service to be instantiated early so it can intercept terminal creation and inject
// PSP_* env vars. (Registering as `Eager` would still wait for a consumer; a workbench contribution
// at `BlockStartup` actually runs at startup.)
class PspStarter extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.processStateProtocol';
	constructor(@IProcessStateProtocolService _service: IProcessStateProtocolService) {
		super();
	}
}
registerWorkbenchContribution2(PspStarter.ID, PspStarter, WorkbenchPhase.BlockStartup);

CommandsRegistry.registerCommand({
	id: OPEN_PSP_SESSION_COMMAND_ID,
	handler: async (accessor: ServicesAccessor, sessionId: string) => {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: sessionUri(sessionId) });
	},
});

// Invoked by the terminal tab action button. Receives the ITerminalInstance from the tab list.
CommandsRegistry.registerCommand({
	id: OPEN_PSP_SESSION_BY_TERMINAL_COMMAND_ID,
	handler: async (accessor: ServicesAccessor, instance: ITerminalInstance) => {
		const pspService = accessor.get(IProcessStateProtocolService);
		const session = pspService.getSessionForTerminal(instance.instanceId);
		if (!session) {
			return; // no publisher has connected yet
		}
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: sessionUri(session.id) });
	},
});


