/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Resolves variables in a VS Code snippet style string
 */
export function resolveSnippet(snippetString: string, vars: ReadonlyMap<string, string>): string {
	return snippetString.replaceAll(/(?<escape>\\\$)|(?<!\\)\$\{(?<name>\w+)(?:\/(?<pattern>(?:\\\/|[^\}])+?)\/(?<replacement>(?:\\\/|[^\}])+?)\/)?\}/g, (match, _escape, name, pattern, replacement, _offset, _str, groups) => {
		if (groups?.['escape']) {
			return '$';
		}

		const entry = vars.get(name);
		if (typeof entry !== 'string') {
			return match;
		}

		if (pattern && replacement) {
			return entry.replace(new RegExp(replaceTransformEscapes(pattern)), replaceTransformEscapes(replacement));
		}

		return entry;
	});
}


function replaceTransformEscapes(str: string): string {
	return str.replaceAll(/\\\//g, '/');
}

