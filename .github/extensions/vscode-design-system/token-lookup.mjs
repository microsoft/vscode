/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function findTokens(tokens, input) {
	const query = input.trim().replace(/^var\(\s*/, '').replace(/\s*\)$/, '').toLowerCase();
	return tokens.filter(token => token.id.toLowerCase().includes(query) || token.css.toLowerCase().includes(query))
		.sort((a, b) => Number(b.id.toLowerCase() === query || b.css.toLowerCase() === query)
			- Number(a.id.toLowerCase() === query || a.css.toLowerCase() === query) || a.id.localeCompare(b.id));
}
