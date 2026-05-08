/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getQuoteByCharacter, formatQuoteShort } from 'son-of-anton-core/personality/siliconValleyQuotes';
import { isPersonalityEnabled } from './personalityConfig';

// 4-line Son of Anton glyph (compact -- the full glyph in asciiArt.ts is 7
// lines, which is too tall for a terminal banner that competes with the
// shell prompt).
const SON_OF_ANTON_BANNER_LINES = [
	'  +---------------------------------------+',
	'  |  [#]  S O N  O F  A N T O N           |',
	'  |       sandbox terminal                |',
	'  +---------------------------------------+',
];

/**
 * Displays a brief ASCII banner on the first terminal opened in a Son of
 * Anton session. Includes a 4-line glyph, a Gilfoyle quote (sandbox = where
 * commands run, so dry/cynical fits the surface), and a one-line footer.
 *
 * Uses a session-scoped flag so the banner only appears once per
 * activation, and respects `sota.personality.enabled` -- the feature
 * silently no-ops when personality is off.
 */
export class TerminalBanner implements vscode.Disposable {
	private shown = false;
	private readonly disposable: vscode.Disposable;

	constructor() {
		this.disposable = vscode.window.onDidOpenTerminal(terminal => {
			if (this.shown || !isPersonalityEnabled()) {
				return;
			}
			this.shown = true;
			// Small delay to let the terminal initialise before sending text
			setTimeout(() => {
				const banner = this.buildBanner();
				terminal.sendText(`echo '${banner.replace(/'/g, '\'\\\'\'')}'`, true);
			}, 500);
		});
	}

	private buildBanner(): string {
		const lines = [...SON_OF_ANTON_BANNER_LINES];
		const quote = getQuoteByCharacter('Gilfoyle');
		if (quote) {
			lines.push(`  ${formatQuoteShort(quote)}`);
		}
		lines.push('  Type \'help\' for commands.');
		lines.push('');
		return lines.join('\n');
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
