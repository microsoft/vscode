/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const escapeCodiconsRegex = /(?<!\\)\$\([a-z0-9\-]+?(?:~[a-z0-9\-]*?)?\)/gi;
export function escapeCodicons(text: string): string {
	return text.replace(escapeCodiconsRegex, match => `\\${match}`);
}

const markdownEscapedCodiconsRegex = /\\\$\([a-z0-9\-]+?(?:~[a-z0-9\-]*?)?\)/gi;
export function markdownEscapeEscapedCodicons(text: string): string {
	// Need to add an extra \ for escaping in markdown
	return text.replace(markdownEscapedCodiconsRegex, match => `\\${match}`);
}

const markdownUnescapeCodiconsRegex = /(?<!\\)\$\\\(([a-z0-9\-]+?(?:~[a-z0-9\-]*?)?)\\\)/gi;
export function markdownUnescapeCodicons(text: string): string {
	return text.replace(markdownUnescapeCodiconsRegex, (_, codicon) => `$(${codicon})`);
}

const renderCodiconsRegex = /(\\)?\$\((([a-z0-9\-]+?)(?:~([a-z0-9\-]*?))?)\)/gi;
export function renderCodicons(text: string): string {
	return text.replace(renderCodiconsRegex, (_, escape, codicon, name, animation) => {
		return escape
			? `$(${codicon})`
			: `<span class="codicon codicon-${name}${animation ? ` codicon-animation-${animation}` : ''}"></span>`;
	});
}
