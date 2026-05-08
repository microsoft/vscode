/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getRandomQuote, formatQuoteShort } from 'son-of-anton-core/personality/siliconValleyQuotes';
import { getStaticArt } from 'son-of-anton-core/personality/asciiArt';
import { getAnimation, playOnOutputChannel } from 'son-of-anton-core/personality/asciiAnimations';
import { isPersonalityEnabled } from './personalityConfig';

/**
 * Easter egg: typing "uuddlrlrba" (the Konami code using letter keys)
 * anywhere in the editor triggers the full Pied Piper celebration --
 * the hooHooHoo animation, then the Pied Piper logo, then a random
 * Silicon Valley quote, then the "Welcome to the incubator." footer.
 *
 * Also available via the command palette as "Anton: Konami Code".
 *
 * The listener watches document edits and maintains a rolling buffer of
 * recent characters. It does not interfere with normal editing -- characters
 * still appear in the document as typed.
 */
const KONAMI_STRING = 'uuddlrlrba';

export class KonamiCode implements vscode.Disposable {
	private buffer = '';
	private readonly disposables: vscode.Disposable[] = [];
	private channel: vscode.OutputChannel | undefined;

	constructor() {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(event => {
				for (const change of event.contentChanges) {
					if (change.text.length === 1) {
						this.buffer += change.text.toLowerCase();
						// Keep the buffer at a reasonable length
						if (this.buffer.length > KONAMI_STRING.length) {
							this.buffer = this.buffer.slice(-KONAMI_STRING.length);
						}
						if (this.buffer === KONAMI_STRING) {
							this.buffer = '';
							this.trigger();
						}
					} else {
						// Multi-character insert (paste, autocomplete) resets the buffer
						this.buffer = '';
					}
				}
			})
		);

		this.disposables.push(
			vscode.commands.registerCommand('sota.konami', () => this.trigger())
		);
	}

	private trigger(): void {
		if (!isPersonalityEnabled()) {
			return;
		}

		const channel = this.getChannel();
		channel.show(true);

		// Step 1: play the Hoo-hoo-hoo animation in a dedicated channel.
		const hooAnimation = getAnimation('hooHooHoo');
		const animationDisposable = playOnOutputChannel(channel, hooAnimation);
		this.disposables.push(animationDisposable);

		// Step 2: after the animation completes, replace the channel
		// contents with the static logo + quote. The animation has
		// `loop = false` and 12 frames at 220ms = ~2.6s, so wait a bit
		// longer than that before painting the final state.
		const totalMs = hooAnimation.frames.length * hooAnimation.frameMs + 200;
		setTimeout(() => {
			animationDisposable.dispose();
			channel.clear();
			channel.appendLine('');
			channel.appendLine(getStaticArt('piedPiperLogo'));
			channel.appendLine('');
			const quote = getRandomQuote();
			channel.appendLine(`   ${formatQuoteShort(quote)}`);
			if (quote.context) {
				channel.appendLine(`     (${quote.context})`);
			}
			channel.appendLine('');
			channel.appendLine('   Welcome to the incubator.');
			channel.appendLine('');
		}, totalMs);
	}

	private getChannel(): vscode.OutputChannel {
		if (!this.channel) {
			this.channel = vscode.window.createOutputChannel('Son of Anton: Konami');
			this.disposables.push(this.channel);
		}
		return this.channel;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
