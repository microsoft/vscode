/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';

export class CwdDetectionCapability {
	readonly type = TerminalCapability.CwdDetection;
	private _cwd = '';
	private _cwds = new Map</*cwd*/string, /*frequency*/number>();

	/**
	 * Gets the list of cwds seen in this session in order of descending frequency.
	 */
	get cwds(): string[] {
		return Array.from(Array.from(this._cwds.entries()).sort((a, b) => b[1] - a[1])).map(s => s[0]);
	}

	private readonly _onDidChangeCwd = new Emitter<string>();
	readonly onDidChangeCwd = this._onDidChangeCwd.event;

	getCwd(): string {
		return this._cwd;
	}

	updateCwd(cwd: string): void {
		const didChange = this._cwd !== cwd;
		this._cwd = cwd;
		this._cwds.set(this._cwd, (this._cwds.get(this._cwd) || 0) + 1);
		if (didChange) {
			this._onDidChangeCwd.fire(cwd);
		}
	}
}
