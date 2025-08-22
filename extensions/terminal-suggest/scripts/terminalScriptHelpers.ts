/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { platform } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

/**
 * Cleans up text from terminal control sequences and formatting artifacts
 */
export function cleanupText(text: string): string {
	// Remove ANSI escape codes
	let cleanedText = text.replace(/\x1b\[\d+m/g, '');

	// Remove backspace sequences (like a\bb which tries to print a, move back, print b)
	// This regex looks for a character followed by a backspace and another character
	const backspaceRegex = /.\x08./g;
	while (backspaceRegex.test(cleanedText)) {
		cleanedText = cleanedText.replace(backspaceRegex, match => match.charAt(2));
	}

	// Remove any remaining backspaces and their preceding characters
	cleanedText = cleanedText.replace(/.\x08/g, '');

	// Remove underscores that are used for formatting in some fish help output
	cleanedText = cleanedText.replace(/_\b/g, '');

	return cleanedText;
}

/**
 * Copyright notice for generated files
 */
export const copyright = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/`;

/**
 * Checks if the script is running on Windows and exits if so
 */
export function checkWindows(): void {
	if (platform() === 'win32') {
		console.error('\x1b[31mThis command is not supported on Windows\x1b[0m');
		process.exit(1);
	}
}
