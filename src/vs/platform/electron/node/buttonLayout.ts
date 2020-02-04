/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';

export type ButtonLayout = ('maximize' | 'minimize')[];

export function getGnomeButtonLayout(): Promise<ButtonLayout | null> {
	return new Promise((resolve, reject) => {
		let child = spawn('gsettings', ['get', 'org.gnome.desktop.wm.preferences', 'button-layout']);
		let stdout = '';

		child.stdout.on('data', chunk => stdout += chunk.toString());
		child.once('close', (code) => {
			if (code === 0) {
				stdout = stdout.replace(/'/g, '');

				if (stdout.length < 0) {
					resolve(null);
				}

				let layout = stdout.split(',').filter(item => item === 'maximize' || item === 'minimize');

				resolve(layout as ('maximize' | 'minimize')[]);
			}

			resolve(null);
		});
		child.once('error', () => {
			resolve(null);
		});
	});
}
