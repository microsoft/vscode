/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TerminalOutput } from './terminal.js';

// ConPTY can enable this through forwarded output. Node readline does not decode its key records.
export const disableWin32InputMode = '\x1b[?9001l';

export function resetLocalInputMode(output: TerminalOutput): Promise<void> {
	if (!output.isTTY) {
		return Promise.resolve();
	}
	if (output.destroyed || output.writableEnded) {
		return Promise.reject(new Error('Unable to restore terminal keyboard mode: output is closed.'));
	}
	return new Promise((resolve, reject) => {
		const onError = (): void => reject(new Error('Unable to restore terminal keyboard mode.'));
		output.once('error', onError);
		try {
			output.write(disableWin32InputMode, error => {
				if (error) {
					// Writable emits the error event after invoking the write callback.
					reject(new Error('Unable to restore terminal keyboard mode.'));
				} else {
					output.off('error', onError);
					resolve();
				}
			});
		} catch (error) {
			output.off('error', onError);
			reject(error);
		}
	});
}
