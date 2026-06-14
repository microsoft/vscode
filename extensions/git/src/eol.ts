/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Matches vscode.EndOfLine: LF = 1, CRLF = 2
export const EOL_LF = 1;
export const EOL_CRLF = 2;

export function normalizeEOL(text: string, targetEOL: typeof EOL_LF | typeof EOL_CRLF): string {
	if (targetEOL === EOL_CRLF) {
		return text.replace(/(?<!\r)\n/g, '\r\n');
	} else {
		return text.replace(/\r\n/g, '\n');
	}
}
