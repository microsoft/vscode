/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A `console_scripts` entry point: `<executable> = <module>:<function>`. */
export interface ParsedEntryPoint {
	readonly executable: string;
	/** e.g. `my_pkg.talker:main`. */
	readonly target: string;
}

export interface ParsedSetupPy {
	readonly consoleScripts: ParsedEntryPoint[];
}

/**
 * Extract `console_scripts` entry points from an ament_python `setup.py`.
 *
 * ament_python packages declare node executables like:
 *   entry_points={ 'console_scripts': [ 'talker = my_pkg.talker:main', ... ] }
 *
 * This scans for the `console_scripts` list and pulls out each `a = b:c`
 * string literal. It is intentionally tolerant and regex-based (no Python
 * evaluation), and also works for `setup.cfg`'s `console_scripts` section.
 */
export function parseSetupPy(rawText: string): ParsedSetupPy {
	const consoleScripts: ParsedEntryPoint[] = [];

	// Isolate the console_scripts list body when present to avoid pulling in
	// unrelated string literals; fall back to scanning the whole file.
	const listBody = extractConsoleScriptsBody(rawText) ?? rawText;

	// Matches both setup.py string literals ('talker = my_pkg.talker:main') and
	// setup.cfg unquoted lines (talker = my_pkg.talker:main). The `module:function`
	// shape (must contain a colon) guards against unrelated `key = value` noise.
	const entryRe = /(?:^|[\s,'"[])([A-Za-z0-9_.-]+)\s*=\s*([A-Za-z0-9_.]+:[A-Za-z0-9_.]+)/g;
	let m: RegExpExecArray | null;
	const seen = new Set<string>();
	while ((m = entryRe.exec(listBody)) !== null) {
		const executable = m[1];
		if (!seen.has(executable)) {
			seen.add(executable);
			consoleScripts.push({ executable, target: m[2] });
		}
	}

	return { consoleScripts };
}

/** Return the text between `console_scripts` and its matching closing bracket, if found. */
function extractConsoleScriptsBody(text: string): string | undefined {
	const idx = text.indexOf('console_scripts');
	if (idx === -1) {
		return undefined;
	}
	// setup.py form: 'console_scripts': [ ... ]
	const bracketStart = text.indexOf('[', idx);
	if (bracketStart !== -1) {
		let depth = 0;
		for (let i = bracketStart; i < text.length; i++) {
			const ch = text[i];
			if (ch === '[') {
				depth++;
			} else if (ch === ']') {
				depth--;
				if (depth === 0) {
					return text.slice(bracketStart + 1, i);
				}
			}
		}
	}
	// setup.cfg form: console_scripts = \n  a = b:c \n  ... (until blank line / next section)
	const sectionMatch = /console_scripts\s*=\s*([\s\S]*?)(?:\n\s*\n|\n\[|$)/.exec(text.slice(idx));
	return sectionMatch ? sectionMatch[1] : undefined;
}
