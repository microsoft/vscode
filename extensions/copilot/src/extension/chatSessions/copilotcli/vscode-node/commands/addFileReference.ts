/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger } from '../../../../../platform/log/common/logService';
import { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';
import { InProcHttpServer } from '../inProcHttpServer';
import { sendEditorContextToSession, sendUriToSession } from './sendContext';

export const ADD_FILE_REFERENCE_COMMAND = 'github.copilot.chat.copilotCLI.addFileReference';

export function registerAddFileReferenceCommand(logger: ILogger, httpServer: InProcHttpServer, sessionTracker: ICopilotCLISessionTracker): vscode.Disposable {
	return vscode.commands.registerCommand(ADD_FILE_REFERENCE_COMMAND, async (uri?: vscode.Uri) => {
		logger.debug('Add file reference command executed');

		if (uri) {
			await sendUriToSession(logger, httpServer, sessionTracker, uri);
		} else {
			await sendEditorContextToSession(logger, httpServer, sessionTracker);
		}
	});
}
