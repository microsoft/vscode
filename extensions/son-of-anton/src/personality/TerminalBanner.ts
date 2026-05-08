/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getQuoteByCharacter, formatQuoteShort } from 'son-of-anton-core/personality/siliconValleyQuotes';
import { isPersonalityEnabled } from './personalityConfig';

// Single-line wordmark plus a subtitle. The previous boxed ASCII banner
// looked harsh against most shell themes; this minimalist version reads as
// chrome rather than noise. Box-drawing glyphs render consistently across
// Terminal.app, iTerm2, the integrated VS Code terminal, and Alacritty.
const SON_OF_ANTON_BANNER_LINES = [
	'',
	'  ◇  Son of Anton · sandbox terminal',
	'',
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
