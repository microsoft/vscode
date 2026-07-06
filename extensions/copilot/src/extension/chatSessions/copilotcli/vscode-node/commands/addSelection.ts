/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger } from '../../../../../platform/log/common/logService';
import { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';
import { InProcHttpServer } from '../inProcHttpServer';
import { sendEditorContextToSession } from './sendContext';

export const ADD_SELECTION_COMMAND = 'github.copilot.chat.copilotCLI.addSelection';

export function registerAddSelectionCommand(logger: ILogger, httpServer: InProcHttpServer, sessionTracker: ICopilotCLISessionTracker): vscode.Disposable {
	return vscode.commands.registerCommand(ADD_SELECTION_COMMAND, async () => {
		logger.debug('Add selection command executed');
		await sendEditorContextToSession(logger, httpServer, sessionTracker);
	});
}
