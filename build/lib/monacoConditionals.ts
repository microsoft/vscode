/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code that differs between VS Code and the standalone editor (`monaco-editor-core`), within one source file:
 *
 * ```ts
 * // #if MONACO
 * // import { createTsDiffComputer } from '@vscode/diff/core';
 * // #else
 * import { resolveAmdNodeModulePath } from '../../../amdX.js';
 * // #endif
 * ```
 *
 * In the sources, the Monaco branch is commented out, so VS Code compiles, lints and runs the other branch. When
 * the standalone editor is extracted, {@link applyMonacoConditionals} uncomments the Monaco branch and comments out
 * the other one. The `#else` branch is optional. Line counts are preserved, so line numbers stay the same.
 */

const markerRegex = /^(?<indent>\s*)\/\/\s*#(?<directive>if MONACO|else|endif)\s*$/;
const commentedLineRegex = /^(?<indent>\s*)\/\/ ?(?<code>.*)$/;

type State = 'outside' | 'monaco' | 'other';

export function applyMonacoConditionals(contents: string, fileName = '<unknown>'): string {
	if (!contents.includes('#if MONACO')) {
		return contents;
	}
	const lines = contents.split('\n');
	let state: State = 'outside';
	let openedAt = 0;
	const fail = (lineIndex: number, message: string): never => {
		throw new Error(`${fileName}:${lineIndex + 1}: ${message}`);
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, '');
		const eol = lines[i].endsWith('\r') ? '\r' : '';
		const directive = markerRegex.exec(line)?.groups?.directive;
		if (directive === 'if MONACO') {
			if (state !== 'outside') {
				fail(i, '`#if MONACO` cannot be nested');
			}
			state = 'monaco';
			openedAt = i;
		} else if (directive === 'else') {
			if (state !== 'monaco') {
				fail(i, '`#else` without `#if MONACO`');
			}
			state = 'other';
		} else if (directive === 'endif') {
			if (state === 'outside') {
				fail(i, '`#endif` without `#if MONACO`');
			}
			state = 'outside';
		} else if (state === 'monaco') {
			if (line.trim() !== '') {
				const match = commentedLineRegex.exec(line);
				if (!match) {
					fail(i, 'every line of a `#if MONACO` branch must be commented out with `//`');
				}
				lines[i] = match!.groups!.indent + match!.groups!.code + eol;
			}
		} else if (state === 'other') {
			if (line.trim() !== '') {
				const indent = /^\s*/.exec(line)![0];
				lines[i] = `${indent}// ${line.slice(indent.length)}${eol}`;
			}
		}
	}
	if (state !== 'outside') {
		fail(openedAt, '`#if MONACO` without `#endif`');
	}
	return lines.join('\n');
}
