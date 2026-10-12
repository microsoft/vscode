/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function filepaths(options: { extensions?: string[]; equals?: string | string[]; editFileSuggestions?: { priority: number } }): Fig.Generator {
	return {
		custom: async (tokens, executeCommand, generatorContext) => {
			const fileNames = typeof options.equals === 'string' ? [options.equals] : options.equals ?? [];
			const resourceFilter: Record<string, string[]> = {
				fileExtensions: options.extensions ?? [],
				fileNames,
			};
			return [{ type: 'file', _internal: resourceFilter }, { type: 'folder' }];
		},
		trigger: (oldToken, newToken) => {
			return true;
		},
		getQueryTerm: (token) => token
	};
}
