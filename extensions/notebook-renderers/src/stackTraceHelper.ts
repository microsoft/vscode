/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function formatStackTrace(stack: string) {
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

	if (isIpythonStackTrace(cleaned)) {
		return linkifyStack(cleaned);
	}

	return cleaned;
}

const formatSequence = /\u001b\[.+?m/g;
const fileRegex = /File\s+(?:\u001b\[.+?m)?(.+):(\d+)/;
const lineNumberRegex = /((?:\u001b\[.+?m)?[ ->]*?)(\d+)(.*)/;
const cellRegex = /(Cell\s+(?:\u001b\[.+?m)?In\s*\[(\d+)\])(,\s*line \d+)/;
// older versions of IPython ~8.3.0
const inputRegex = /(Input\s+?(?:\u001b\[.+?m)In\s*\[(\d+)\])(.*?)/;

function isIpythonStackTrace(stack: string) {
	// at least one group will point to the Cell within the notebook
	return cellRegex.test(stack);
}

function stripFormatting(text: string) {
	return text.replace(formatSequence, '');
}

function linkifyStack(stack: string) {
	const lines = stack.split('\n');

	let fileOrCell: string | undefined;

	for (const i in lines) {

		const original = lines[i];
		console.log(`linkify ${original}`); // REMOVE
		if (fileRegex.test(original)) {
			const fileMatch = lines[i].match(fileRegex);
			fileOrCell = stripFormatting(fileMatch![1]);
			console.log(`matched file ${fileOrCell}`); // REMOVE
			continue;
		} else if (cellRegex.test(original)) {
			lines[i] = original.replace(cellRegex, (_s, cellLabel, executionCount, suffix) => {
				fileOrCell = `vscode-notebook-cell:?execution=${stripFormatting(executionCount)}`;
				return `<a href='${fileOrCell}'>${stripFormatting(cellLabel)}</a>${suffix}`;
			});
			console.log(`matched cell ${fileOrCell}`); // REMOVE
			continue;
		} else if (inputRegex.test(original)) {
			lines[i] = original.replace(inputRegex, (_s, cellLabel, executionCount, suffix) => {
				fileOrCell = `vscode-notebook-cell:?execution=${stripFormatting(executionCount)}`;
				return `<a href='${fileOrCell}'>${stripFormatting(cellLabel)}</a>${suffix}`;
			});
			console.log(`matched cell ${fileOrCell}`); // REMOVE
			continue;
		} else if (!fileOrCell || original.trim() === '') {
			// we don't have a location, so don't linkify anything
			fileOrCell = undefined;
			continue;
		} else if (lineNumberRegex.test(original)) {

			lines[i] = original.replace(lineNumberRegex, (_s, prefix, num, suffix) => {
				return `${prefix}<a href='${fileOrCell}:${num}'>${num}</a>${suffix}`;
			});
			console.log(`matched line ${lines[i]}`); // REMOVE
			continue;
		}
	}

	return lines.join('\n');
}
