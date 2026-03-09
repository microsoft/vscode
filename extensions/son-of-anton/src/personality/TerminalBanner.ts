/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const BANNER = [
	'  ┌─────────────────────────────────────┐',
	'  │  ⬡  SON OF ANTON                    │',
	'  │  Agents ready. Graph synced.        │',
	'  │  Type @anton in chat to begin.      │',
	'  └─────────────────────────────────────┘',
	'',
].join('\n');

/**
 * Displays a brief ASCII banner on the first terminal opened in a Son of Anton session.
 * Uses a session-scoped flag so the banner only appears once per activation.
 */
export class TerminalBanner implements vscode.Disposable {
	private shown = false;
	private readonly disposable: vscode.Disposable;

	constructor() {
		this.disposable = vscode.window.onDidOpenTerminal(terminal => {
			if (!this.shown) {
				this.shown = true;
				// Small delay to let the terminal initialise before sending text
				setTimeout(() => {
					terminal.sendText(`echo '${BANNER.replace(/'/g, "'\\''")}'`, true);
				}, 500);
			}
		});
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
