/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';

async function setupMain() {
	const l10nLog: string[] = [];

	const i10lLocation = process.env['VSCODE_L10N_BUNDLE_LOCATION'];
	if (i10lLocation) {
		try {
			await l10n.config({ uri: i10lLocation });
			l10nLog.push(`l10n: Configured to ${i10lLocation.toString()}`);
		} catch (e) {
			l10nLog.push(`l10n: Problems loading ${i10lLocation.toString()} : ${e}`);
		}
	}
	await import('./jsonServerMain.js');
	l10nLog.forEach(console.log);
}
setupMain();
