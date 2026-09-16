/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { FileAccess, nodeModulesAsarPath, nodeModulesPath } from '../../../base/common/network.js';
import { ILogService } from '../../log/common/log.js';

const { statSync }: typeof import('fs') = createRequire(import.meta.url)('fs');

/**
 * Probe the same application-owned path the renderer will import. CommonJS
 * `fs` retains Electron's ASAR support, unlike the ESM bootstrap hook.
 */
export function isEditorViewInstalled(isBuilt: boolean, logService: ILogService, stat: (path: string) => { isFile(): boolean } = statSync): boolean {
	const modulesPath = isBuilt ? nodeModulesAsarPath : nodeModulesPath;
	const entry = FileAccess.asFileUri(`${modulesPath}/@vscode/editor-view/dist/index.js`).fsPath;
	try {
		return stat(entry).isFile();
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
			logService.debug('Optional @vscode/editor-view renderer is not installed.');
		} else {
			logService.error('Unable to detect optional @vscode/editor-view renderer.', error);
		}
		return false;
	}
}
