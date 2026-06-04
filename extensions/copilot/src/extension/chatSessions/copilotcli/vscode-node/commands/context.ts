/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands } from 'vscode';
import { InProcHttpServer } from '../inProcHttpServer';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';

export function registerCommandContext(httpServer: InProcHttpServer) {
	setCliSessionContext(httpServer.getConnectedSessionIds().length > 0);
	const disposables = new DisposableStore();
	disposables.add(httpServer.onDidClientConnect(() => {
		setCliSessionContext(httpServer.getConnectedSessionIds().length > 0);
	}));
	disposables.add(httpServer.onDidClientDisconnect(() => {
		setCliSessionContext(httpServer.getConnectedSessionIds().length > 0);
	}));
	return disposables;
}

function setCliSessionContext(hasSession: boolean) {
	void commands.executeCommand('setContext', 'github.copilot.chat.copilotCLI.hasSession', hasSession);

}
