/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability, TerminalShellIntegrationEnvironment } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { mapsStrictEqualIgnoreOrder } from '../../../../base/common/map.js';

export interface IShellEnv {
	value: Map<string, string>;
	isTrusted: boolean;
}

export class ShellEnvDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	readonly type = TerminalCapability.ShellEnvDetection;

	private _pendingEnv: IShellEnv | undefined;
	private _env: IShellEnv = { value: new Map(), isTrusted: true };

	get env(): TerminalShellIntegrationEnvironment {
		return this._createStateObject();
	}

	private readonly _onDidChangeEnv = this._register(new Emitter<TerminalShellIntegrationEnvironment>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;

	setEnvironment(env: { [key: string]: string | undefined }, isTrusted: boolean): void {
		if (equals(this.env.value, env)) {
			return;
		}

		this._env.value.clear();
		for (const [key, value] of Object.entries(env)) {
			if (value !== undefined) {
				this._env.value.set(key, value);
			}
		}
		this._env.isTrusted = isTrusted;

		this._fireEnvChange();
	}

	startEnvironmentSingleVar(clear: boolean, isTrusted: boolean): void {
		if (clear) {
			this._pendingEnv = {
				value: new Map(),
				isTrusted
			};
		} else {
			this._pendingEnv = {
				value: new Map(this._env.value),
				isTrusted: this._env.isTrusted && isTrusted
			};
		}

	}

	setEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		if (!this._pendingEnv) {
			return;
		}
		if (key !== undefined && value !== undefined) {
			this._pendingEnv.value.set(key, value);
			this._pendingEnv.isTrusted &&= isTrusted;
		}
	}

	endEnvironmentSingleVar(isTrusted: boolean): void {
		if (!this._pendingEnv) {
			return;
		}
		this._pendingEnv.isTrusted &&= isTrusted;
		const envDiffers = !mapsStrictEqualIgnoreOrder(this._env.value, this._pendingEnv.value);
		if (envDiffers) {
			this._env = this._pendingEnv;
			this._fireEnvChange();
		}
		this._pendingEnv = undefined;
	}

	deleteEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		if (!this._pendingEnv) {
			return;
		}
		if (key !== undefined && value !== undefined) {
			this._pendingEnv.value.delete(key);
			this._pendingEnv.isTrusted &&= isTrusted;
		}
	}

	private _fireEnvChange(): void {
		this._onDidChangeEnv.fire(this._createStateObject());
	}

	private _createStateObject(): TerminalShellIntegrationEnvironment {
		return {
			value: Object.fromEntries(this._env.value),
			isTrusted: this._env.isTrusted
		};
	}
}
