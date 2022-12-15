/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare let self: any;

import * as l10n from '@vscode/l10n';

let initialized = false;
self.onmessage = async (e: any) => {
	if (!initialized) {
		initialized = true;
		const i10lLocation = e.data.i10lLocation;
		if (i10lLocation) {
			await l10n.config({ uri: i10lLocation });
		}
		await import('./htmlServerMain');
	}
};
