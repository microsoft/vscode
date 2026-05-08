/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getRandomQuote, formatQuoteShort } from 'son-of-anton-core/personality/siliconValleyQuotes';
import { getStaticArt } from 'son-of-anton-core/personality/asciiArt';
import { getAnimation, playOnOutputChannel } from 'son-of-anton-core/personality/asciiAnimations';
import { isPersonalityEnabled } from './personalityConfig';
import { StartupMessages } from './StartupMessages';

/**
 * Registers the palette-discoverable Easter Egg commands. Each command
 * silently no-ops when `sota.personality.enabled` is false.
 *
 * Commands:
 *   - `sota.showSiliconValleyQuote`: shows a random quote in a notification.
 *   - `sota.showPiedPiperLogo`: opens the Son of Anton output channel and
 *     prints the full Pied Piper logo.
 *   - `sota.celebrate`: plays the compressionRunning animation in a
 *     dedicated output channel as a visual celebration.
 *
 * Returns the array of registered disposables so the caller can wire them
 * into `context.subscriptions`. Idempotent: callers should only register
 * once per activation.
 */
export function registerPersonalityCommands(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('sota.showSiliconValleyQuote', () => {
			if (!isPersonalityEnabled()) {
				return;
			}
			const quote = getRandomQuote();
			vscode.window.showInformationMessage(formatQuoteShort(quote));
		}),
	);

	disposables.push(
		vscode.commands.registerCommand('sota.showPiedPiperLogo', () => {
			if (!isPersonalityEnabled()) {
				return;
			}
			const channel = StartupMessages.getChannel();
			channel.show(true);
			channel.appendLine('');
			channel.appendLine(getStaticArt('piedPiperLogo'));
			channel.appendLine('');
		}),
	);

	let celebrateChannel: vscode.OutputChannel | undefined;
	let activeCelebration: vscode.Disposable | undefined;
	disposables.push(
		vscode.commands.registerCommand('sota.celebrate', () => {
			if (!isPersonalityEnabled()) {
				return;
			}
			if (!celebrateChannel) {
				celebrateChannel = vscode.window.createOutputChannel('Son of Anton: Celebrate');
				disposables.push(celebrateChannel);
			}
			celebrateChannel.show(true);
			activeCelebration?.dispose();
			activeCelebration = playOnOutputChannel(
				celebrateChannel,
				getAnimation('compressionRunning'),
			);
		}),
	);

	disposables.push({
		dispose: (): void => {
			activeCelebration?.dispose();
		},
	});

	return disposables;
}
