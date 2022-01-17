/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';

export class CwdDetectionCapability {
	readonly type = TerminalCapability.CwdDetection;
	private _cwd = '';

	private readonly _onDidChangeCwd = new Emitter<string>();
	readonly onDidChangeCwd = this._onDidChangeCwd.event;

	async getCwd(): Promise<string> {
		return this._cwd;
	}

	updateCwd(cwd: string): void {
		if (this._cwd !== cwd) {
			this._onDidChangeCwd.fire(cwd);
		}
		this._cwd = cwd;
	}
}
