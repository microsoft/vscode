/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default auto-approval rules for `sort`.
 */
export const sortAutoApproveRules: Readonly<Record<string, boolean>> = {
	'/^sort\\b(?!-)/': true,

	// - `-o`: Writes output to a file.
	// - `-S`: Can request enough memory to cause denial of service.
	'/^sort\\b.*\\s-(o|S)\\b/': false,

	// GNU sort accepts unique long-option abbreviations. `--co` is the shortest unique
	// abbreviation for `--compress-program`; deny it and every longer spelling. Ignore
	// shell quote and escape syntax within the prefix since the shell removes it.
	'/^sort\\b.*\\s(?:\\$?[\'"]|\\\\)*-(?:\\$?[\'"]|\\\\)*-(?:\\$?[\'"]|\\\\)*c(?:\\$?[\'"]|\\\\)*o/': false,
};
