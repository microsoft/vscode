/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

export async function isDataActive(instance: ITerminalInstance): Promise<boolean> {
	let isDataActive = false;
	await new Promise<void>(resolve => {
		const dataListener = instance.onData(() => {
			isDataActive = true;
		});
		setTimeout(() => {
			dataListener.dispose();
			resolve();
		}, 500);
	});
	return isDataActive;
}
