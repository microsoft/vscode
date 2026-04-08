/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Derives a friendly name from a filename by removing extension suffixes.
 */
export function getFriendlyName(filename: string): string {
	// Remove common prompt file extensions like .instructions.md, .prompt.md, etc.
	let name = filename
		.replace(/\.instructions\.md$/i, '')
		.replace(/\.prompt\.md$/i, '')
		.replace(/\.agent\.md$/i, '')
		.replace(/\.md$/i, '');

	// Convert kebab-case or snake_case to Title Case
	name = name
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());

	return name || filename;
}
