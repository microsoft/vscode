/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { URI } from 'vscode-uri';

async function setupMain() {
	const i10lLocation = process.env['VSCODE_L10N_BUNDLE_LOCATION'];
	if (i10lLocation) {
		const uri = URI.parse(i10lLocation);
		if (uri.scheme === 'file') {
			l10n.config({ fsPath: uri.fsPath });
		} else {
			await l10n.config({ uri: i10lLocation });
		}
		await import('./htmlServerMain');
	}
}
setupMain();
