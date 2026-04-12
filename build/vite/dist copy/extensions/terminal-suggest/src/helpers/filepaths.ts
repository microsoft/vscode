/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function filepaths(options: { extensions?: string[]; editFileSuggestions?: { priority: number } }): Fig.Generator {
	return {
		custom: async (tokens, executeCommand, generatorContext) => {
			const fileExtensionsMap: Record<string, string[]> = { fileExtensions: options.extensions || [] };
			return [{ type: 'file', _internal: fileExtensionsMap }, { type: 'folder' }];
		},
		trigger: (oldToken, newToken) => {
			return true;
		},
		getQueryTerm: (token) => token
	};
}
