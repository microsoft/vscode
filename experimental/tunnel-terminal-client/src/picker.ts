/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createInterface } from 'node:readline/promises';
import { stripVTControlCharacters } from 'node:util';
import type { TerminalInput, TerminalOutput } from './terminal.js';
import { resetLocalInputMode } from './terminalModes.js';

export function safeLabel(value: string): string {
	return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

export async function choose<T>(
	label: string,
	items: { label: string; value: T }[],
	signal: AbortSignal,
	io: { input: TerminalInput; output: TerminalOutput; modeOutput?: TerminalOutput } = { input: process.stdin, output: process.stderr, modeOutput: process.stdout },
): Promise<T> {
	if (!items.length) {
		throw new Error(`No choices available for ${label}.`);
	}
	const prompt = createInterface({ input: io.input, output: io.output });
	const cancelled = new AbortController();
	const onInterrupt = (): void => cancelled.abort();
	prompt.on('SIGINT', onInterrupt);
	try {
		await resetLocalInputMode(io.modeOutput ?? io.output);
		io.output.write(`\n${safeLabel(label)}\n`);
		for (const [index, item] of items.entries()) {
			io.output.write(`  ${index + 1}. ${safeLabel(item.label)}\n`);
		}
		while (true) {
			const answer = await prompt.question('Select a number (Ctrl+C cancels): ', { signal: AbortSignal.any([signal, cancelled.signal]) });
			const selected = Number(answer);
			if (/^\d+$/.test(answer.trim()) && Number.isInteger(selected) && selected >= 1 && selected <= items.length) {
				return items[selected - 1].value;
			}
			io.output.write(`Enter a number between 1 and ${items.length}.\n`);
		}
	} finally {
		prompt.off('SIGINT', onInterrupt);
		prompt.close();
	}
}
