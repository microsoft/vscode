/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Strip comments from a shell-like code snippet before executing it in the terminal.
 *
 * Behaviour:
 * - Removes /* *\/ block comments (non-nested) across lines.
 * - Removes // line comments unless part of a URL protocol pattern like `http://` or `file://`.
 * - Removes # line comments when the hash is the first non-whitespace character (or at column 0),
 *   but preserves shebangs (#!) and leaves inline hashes that are part of tokens.
 * - Preserves shebang line entirely.
 * - Trims leading/trailing blank lines and surrounding whitespace at the very end.
 */
export function stripCommentsForShellExecution(code: string): string {
	// Fast return for empty input
	if (!code) {
		return '';
	}

	// 1) Remove block comments
	const withoutBlocks = code.replace(/\/\*[\s\S]*?\*\//g, '');

	// 2) Process each line for // and #
	const lines = withoutBlocks.split(/\r?\n/);
	const processed = lines.map(line => {
		// Preserve shebangs (e.g. #!/usr/bin/env bash)
		if (/^\s*#!/.test(line)) {
			return line;
		}

		// Remove '//' comments unless inside a protocol pattern '://'
		const slashIdx = line.indexOf('//');
		if (slashIdx >= 0) {
			const protoIdx = line.lastIndexOf('://', slashIdx);
			if (protoIdx === -1) {
				line = line.slice(0, slashIdx);
			}
		}

		// Remove shell-style '#' comments unless it's a shebang (already handled)
		// Treat as comment only if at start or preceded by whitespace
		const hashIdx = line.indexOf('#');
		if (hashIdx >= 0) {
			if (hashIdx === 0 || /\s/.test(line[hashIdx - 1])) {
				line = line.slice(0, hashIdx);
			}
		}

		return line;
	});

	return processed.join('\n').trim();
}
