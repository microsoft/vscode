/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalCapability } from 'vs/platform/terminal/common/terminal';

export class CwdDetectionCapability {
	readonly type = TerminalCapability.CwdDetection;
	private _cwd = '';
	//TODO: move shell integration addon in here
	async getCwd(): Promise<string> {
		return this._cwd;
	}

	updateCwd(cwd: string): void {
		this._cwd = cwd;
	}
}
