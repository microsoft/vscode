/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function cleanStackTrace(stack: string) {
	let cleaned: string;
	// Ansi colors are described here:
	// https://en.wikipedia.org/wiki/ANSI_escape_code under the SGR section

	// Remove background colors. The ones from IPython don't work well with
	// themes 40-49 sets background color
	cleaned = stack.replace(/\u001b\[4\dm/g, '');

	// Also remove specific foreground colors (38 is the ascii code for picking one) (they don't translate either)
	// Turn them into default foreground
	cleaned = cleaned.replace(/\u001b\[38;.*?\d+m/g, '\u001b[39m');

	// Turn all foreground colors after the --> to default foreground
	cleaned = cleaned.replace(/(;32m[ ->]*?)(\d+)(.*)\n/g, (_s, prefix, num, suffix) => {
		suffix = suffix.replace(/\u001b\[3\d+m/g, '\u001b[39m');
		return `${prefix}${num}${suffix}\n`;
	});

	return cleaned;
}
