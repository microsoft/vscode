/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare let self: any;

let initialized = false;
self.onmessage = async (e: any) => {
	if (!initialized) {
		initialized = true;
		const i10lLocation = e.data.i10lLocation;
		if (i10lLocation) {
			await (await import('@vscode/l10n')).config({ uri: i10lLocation });
		}
		await import('./cssServerMain');
	}
};
