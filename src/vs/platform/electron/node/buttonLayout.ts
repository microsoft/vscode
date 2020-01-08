/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';

export type ButtonLayout = ('maximize' | 'minimize')[];

export function getGnomeButtonLayout(): ButtonLayout | null {
	let output = spawnSync('gsettings', ['get', 'org.gnome.desktop.wm.preferences', 'button-layout']);

	if (output.status === 0) {
		let stdout = output.stdout.toString().replace(/'/g, '');

		if (stdout.length < 0) {
			return null;
		}

		let layout = stdout.split(',').filter(item => item === 'maximize' || item === 'minimize');

		return layout as ('maximize' | 'minimize')[];
	}

	return null;
}
