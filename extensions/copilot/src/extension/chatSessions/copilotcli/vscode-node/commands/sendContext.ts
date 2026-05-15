/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ILogger } from '../../../../../platform/log/common/logService';
import { Schemas } from '../../../../../util/vs/base/common/network';
import { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';
import { InProcHttpServer } from '../inProcHttpServer';
import { getSelectionInfo } from '../tools';
import { pickSession } from './pickSession';

export interface FileReferenceInfo {
	filePath: string;
	fileUrl: string;
	selection: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	} | null;
	selectedText: string | null;
}

export const ADD_FILE_REFERENCE_NOTIFICATION = 'add_file_reference';

/**
 * URI schemes that represent real file-system files and can be sent to CLI sessions.
 */
const ALLOWED_SCHEMES = new Set([Schemas.file]);

/**
 * Validates URI scheme and shows warning if not allowed.
 * Returns true if allowed, false otherwise.
 */
function validateScheme(logger: ILogger, uri: vscode.Uri): boolean {
	if (ALLOWED_SCHEMES.has(uri.scheme)) {
		return true;
	}
	logger.debug(`Unsupported URI scheme: ${uri.scheme}`);
	vscode.window.showWarningMessage(l10n.t('Cannot send virtual files to Copilot CLI.'));
	return false;
}

/**
 * Picks a session (if needed) and sends a file reference notification.
 */
export async function sendToSession(
	logger: ILogger,
	httpServer: InProcHttpServer,
	sessionTracker: ICopilotCLISessionTracker,
	fileReferenceInfo: FileReferenceInfo,
): Promise<void> {
	const sessionId = await pickSession(logger, httpServer, sessionTracker);
	if (!sessionId) {
		return;
	}

	logger.info(`Sending context to session ${sessionId}: ${fileReferenceInfo.filePath}`);
	httpServer.sendNotification(sessionId, ADD_FILE_REFERENCE_NOTIFICATION, fileReferenceInfo as unknown as Record<string, unknown>);
}

/**
 * Sends a file reference (from explorer URI) to a CLI session.
 */
export async function sendUriToSession(
	logger: ILogger,
	httpServer: InProcHttpServer,
	sessionTracker: ICopilotCLISessionTracker,
	uri: vscode.Uri,
): Promise<void> {
	if (!validateScheme(logger, uri)) {
		return;
	}

	await sendToSession(logger, httpServer, sessionTracker, {
		filePath: uri.fsPath,
		fileUrl: uri.toString(),
		selection: null,
		selectedText: null,
	});
}

/**
 * Sends editor context (file + optional selection) to a CLI session.
 */
export async function sendEditorContextToSession(
	logger: ILogger,
	httpServer: InProcHttpServer,
	sessionTracker: ICopilotCLISessionTracker,
): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		logger.debug('No active editor');
		vscode.window.showWarningMessage(l10n.t('No active editor. Open a file to add a reference.'));
		return;
	}

	if (!validateScheme(logger, editor.document.uri)) {
		return;
	}

	const selectionInfo = getSelectionInfo(editor);

	await sendToSession(logger, httpServer, sessionTracker, {
		filePath: selectionInfo.filePath,
		fileUrl: selectionInfo.fileUrl,
		selection: selectionInfo.selection.isEmpty
			? null
			: {
				start: selectionInfo.selection.start,
				end: selectionInfo.selection.end,
			},
		selectedText: selectionInfo.selection.isEmpty ? null : selectionInfo.text,
	});
}
