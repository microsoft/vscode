/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface LsConfiguration {
	/**
	 * List of file extensions should be considered as markdown.
	 *
	 * These should not include the leading `.`.
	 */
	readonly markdownFileExtensions: readonly string[];
}

const defaultConfig: LsConfiguration = {
	markdownFileExtensions: ['md'],
};

export function getLsConfiguration(overrides: Partial<LsConfiguration>): LsConfiguration {
	return {
		...defaultConfig,
		...overrides,
	};
}
