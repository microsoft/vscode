/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { Platform } from 'vs/base/common/platform';

// https://github.com/microsoft/vscode/issues/100940
function safeSnapOpenExternal(url: string): void {
	const gdkPixbufModuleFile = process.env['GDK_PIXBUF_MODULE_FILE'];
	const gdkPixbufModuleDir = process.env['GDK_PIXBUF_MODULEDIR'];
	delete process.env['GDK_PIXBUF_MODULE_FILE'];
	delete process.env['GDK_PIXBUF_MODULEDIR'];

	shell.openExternal(url);

	process.env['GDK_PIXBUF_MODULE_FILE'] = gdkPixbufModuleFile;
	process.env['GDK_PIXBUF_MODULEDIR'] = gdkPixbufModuleDir;
}

export function openExternal(url: string): void {
	if (Platform.Linux && process.env.SNAP && process.env.SNAP_REVISION) {
		safeSnapOpenExternal(url);
	} else {
		shell.openExternal(url);
	}
}
