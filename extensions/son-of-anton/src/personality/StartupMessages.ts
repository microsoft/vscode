/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Displays a random startup message in the status bar when Son of Anton activates.
 * On Friday afternoons, includes an additional message in the rotation pool.
 */
export class StartupMessages {
	private static readonly DISPLAY_DURATION_MS = 8000;

	static async show(extensionUri: vscode.Uri): Promise<void> {
		const messages = await this.loadMessages(extensionUri);
		if (messages.length === 0) {
			return;
		}

		// On Friday after 4pm, add the Friday afternoon message
		const now = new Date();
		if (now.getDay() === 5 && now.getHours() >= 16) {
			const strings = await this.loadStrings(extensionUri);
			if (strings.fridayAfternoon) {
				messages.push(strings.fridayAfternoon);
			}
		}

		const message = messages[Math.floor(Math.random() * messages.length)];
		vscode.window.setStatusBarMessage(`$(hubot) ${message}`, this.DISPLAY_DURATION_MS);
	}

	private static async loadMessages(extensionUri: vscode.Uri): Promise<string[]> {
		try {
			const messagesUri = vscode.Uri.joinPath(extensionUri, 'resources', 'startup-messages.json');
			const content = await vscode.workspace.fs.readFile(messagesUri);
			return JSON.parse(Buffer.from(content).toString('utf-8'));
		} catch {
			return [];
		}
	}

	private static async loadStrings(extensionUri: vscode.Uri): Promise<Record<string, string>> {
		try {
			const stringsUri = vscode.Uri.joinPath(extensionUri, 'resources', 'strings.json');
			const content = await vscode.workspace.fs.readFile(stringsUri);
			return JSON.parse(Buffer.from(content).toString('utf-8'));
		} catch {
			return {};
		}
	}
}
