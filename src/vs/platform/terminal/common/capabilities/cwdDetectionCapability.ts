/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICwdDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

export class CwdDetectionCapability extends Disposable implements ICwdDetectionCapability {
	readonly type = TerminalCapability.CwdDetection;
	private _cwd = '';
	private _cwds = new Map</*cwd*/string, /*frequency*/number>();

	/**
	 * Gets the list of cwds seen in this session in order of last accessed.
	 */
	get cwds(): string[] {
		return Array.from(this._cwds.keys());
	}

	private readonly _onDidChangeCwd = this._register(new Emitter<string>());
	readonly onDidChangeCwd = this._onDidChangeCwd.event;

	getCwd(): string {
		return this._cwd;
	}

	updateCwd(cwd: string): void {
		const didChange = this._cwd !== cwd;
		this._cwd = cwd;
		const count = this._cwds.get(this._cwd) || 0;
		this._cwds.delete(this._cwd); // Delete to put it at the bottom of the iterable
		this._cwds.set(this._cwd, count + 1);
		if (didChange) {
			this._onDidChangeCwd.fire(cwd);
		}
	}
}
