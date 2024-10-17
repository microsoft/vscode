/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';

let initialized = false;
const pendingMessages: any[] = [];
const messageHandler = async (e: any) => {
	if (!initialized) {
		const l10nLog: string[] = [];
		initialized = true;
		const i10lLocation = e.data.i10lLocation;
		if (i10lLocation) {
			try {
				await l10n.config({ uri: i10lLocation });
				l10nLog.push(`l10n: Configured to ${i10lLocation.toString()}.`);
			} catch (e) {
				l10nLog.push(`l10n: Problems loading ${i10lLocation.toString()} : ${e}.`);
			}
		} else {
			l10nLog.push(`l10n: No bundle configured.`);
		}
		await import('./jsonServerMain.js');
		if (self.onmessage !== messageHandler) {
			pendingMessages.forEach(msg => self.onmessage?.(msg));
			pendingMessages.length = 0;
		}
		l10nLog.forEach(console.log);
	} else {
		pendingMessages.push(e);
	}
};
self.onmessage = messageHandler;
