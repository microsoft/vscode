/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';

export class ShellEnvDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	readonly type = TerminalCapability.ShellEnvDetection;

	private _pendingEnv: Map<string, string> | undefined;
	private _env: Map<string, string> = new Map();
	get env(): Map<string, string> { return this._env; }

	private _isEnvTrusted: boolean = true;
	get isEnvTrusted(): boolean { return this._isEnvTrusted; }

	private readonly _onDidChangeEnv = this._register(new Emitter<Map<string, string>>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;

	private readonly _onDidChangeIsTrusted = this._register(new Emitter<boolean>());
	readonly onDidChangeIsTrusted = this._onDidChangeIsTrusted.event;

	setEnvironment(env: { [key: string]: string | undefined }, isTrusted: boolean): void {
		this._isEnvTrusted = isTrusted;
		this._onDidChangeIsTrusted.fire(this._isEnvTrusted);

		if (equals(this._env, env)) {
			return;
		}

		this._env.clear();
		for (const [key, value] of Object.entries(env)) {
			if (value !== undefined) {
				this._env.set(key, value);
			}
		}

		// Convert to event and fire event
		this._onDidChangeEnv.fire(this._env);
	}

	startEnvironmentSingleVar(isTrusted: boolean): void {
		// Is it necessary to fire _isTrusted event on all methods,
		// Or should we only have one for endEnvironmentSingleVar similar to onDidChangeEnv fire event.
		this._isEnvTrusted = isTrusted;
		this._onDidChangeIsTrusted.fire(this._isEnvTrusted);

		this._pendingEnv = new Map();
	}
	setEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		this._isEnvTrusted = isTrusted;
		this._onDidChangeIsTrusted.fire(this._isEnvTrusted);

		if (key !== undefined && value !== undefined) {
			this._pendingEnv?.set(key, value);
		}
	}
	endEnvironmentSingleVar(isTrusted: boolean): void {

		this._isEnvTrusted = isTrusted;
		this._onDidChangeIsTrusted.fire(this._isEnvTrusted);

		if (!this._pendingEnv) {
			return;
		}
		this._env = this._pendingEnv;
		this._pendingEnv = undefined;
		this._onDidChangeEnv.fire(this._env);

	}
}
