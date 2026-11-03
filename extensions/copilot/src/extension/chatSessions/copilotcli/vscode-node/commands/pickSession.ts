/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { ILogger } from '../../../../../platform/log/common/logService';
import { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';
import { InProcHttpServer } from '../inProcHttpServer';

/**
 * Picks a connected CLI session to send to.
 * Returns the sessionId, or undefined if none are connected or the user dismissed the picker.
 * If only one session is connected, returns it directly without showing a picker.
 */
export async function pickSession(logger: ILogger, httpServer: InProcHttpServer, sessionTracker: ICopilotCLISessionTracker): Promise<string | undefined> {
	const sessionIds = httpServer.getConnectedSessionIds();

	if (sessionIds.length === 0) {
		logger.debug('No connected CLI sessions');
		vscode.window.showWarningMessage(l10n.t('No Copilot CLI sessions are connected.'));
		return undefined;
	}

	if (sessionIds.length === 1) {
		return sessionIds[0];
	}

	const items = sessionIds.map(id => ({
		label: sessionTracker.getSessionDisplayName(id),
		description: sessionTracker.getSessionDisplayName(id) !== id ? id : undefined,
		sessionId: id,
	}));

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: l10n.t('Select a CLI session to send to'),
	});

	return picked?.sessionId;
}
