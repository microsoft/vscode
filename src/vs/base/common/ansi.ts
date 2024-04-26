/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from 'vs/base/common/lazy';

const ansiEscapeSequenceRegex = new Lazy(() => /(?:\u001B|\u009B)[\[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-ntqry=><~]))/g);

/**
 * Strips ANSI escape sequences from a string.
 * @param data The data to strip the ANSI escape sequences from.
 *
 * @example
 * stripAnsiEscapeSequences('\u001b[31mHello, World!\u001b[0m'); // 'Hello, World!'
 */
export function stripAnsiEscapeSequences(data: string): string {
	return data.replace(ansiEscapeSequenceRegex.value, '');
}
