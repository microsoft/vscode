/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITerminalFormatMessageOptions {
	/**
	 * Whether to exclude the new line at the start of the message. Defaults to false.
	 */
	excludeLeadingNewLine?: boolean;
	/**
	 * Whether to use "loud" formatting, this is for more important messages where the it's
	 * desirable to visually break the buffer up. Defaults to false.
	 */
	loudFormatting?: boolean;
}

/**
 * Formats a message from the product to be written to the terminal.
 */
export function formatMessageForTerminal(message: string, options: ITerminalFormatMessageOptions = {}): string {
	let result = '';
	if (!options.excludeLeadingNewLine) {
		result += '\r\n';
	}
	result += '\x1b[0m\x1b[7m * ';
	if (options.loudFormatting) {
		result += '\x1b[0;104m';
	} else {
		result += '\x1b[0m';
	}
	result += ` ${message} \x1b[0m\n\r`;
	return result;
}
