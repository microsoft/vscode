/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';

export class ShellEnvironmentDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	readonly type = TerminalCapability.ShellEnvironmentDetection;

	// TODO: Type of envs should be { [key: string]: string | undefined } | undefined ??
	private _envs: { [key: string]: string | undefined } | undefined = new Map<string, string>();

	get envs(): { [key: string]: string | undefined } | undefined {
		return this._envs;
	}

	private readonly _onDidChangeEnv = this._register(new Emitter<string>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;

	// TODO: update envs
	updateEnvs(envs: { [key: string]: string | undefined } | undefined): void {
		// Should probably go through received envs, see if they exist in _envs,
		// If doesn't already exit in _envs, then add to map

		if (this._envs && envs) {
			for (const key in envs) {
				// check if contained in _envs
				if (!this._envs.has(key)) {
					this._envs.set(key, envs[key]);
				} else {
					// key already exist, so check if value is different and update.
					if (this._envs.get(key) !== envs[key]) {
						this._envs.set(key, envs[key]);
					}
				}
			}
			this._onDidChangeEnv.fire('Would we send the whole envs here?');
		}

	}


}
