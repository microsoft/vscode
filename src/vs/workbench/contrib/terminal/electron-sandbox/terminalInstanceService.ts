/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webUtils } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService';

export class ElectronTerminalInstanceService extends TerminalInstanceService {
	override getPathForFile(file: File) {
		return webUtils.getPathForFile(file)
	}
}
