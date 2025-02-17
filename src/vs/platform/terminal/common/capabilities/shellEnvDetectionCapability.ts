/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
// eslint-disable-next-line local/code-import-patterns
import { TerminalShellIntegrationEnvironment } from 'vscode';

export class ShellEnvDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	readonly type = TerminalCapability.ShellEnvDetection;

	private _pendingEnv: Map<string, string> | undefined;
	private _env: Map<string, string> = new Map();
	private _isTrusted: boolean = false;
	get env(): { value: { [key: string]: string }; isTrusted: boolean } {
		return { value: Object.fromEntries(this._env), isTrusted: this._isTrusted };
	}

	private readonly _onDidChangeEnv = this._register(new Emitter<TerminalShellIntegrationEnvironment>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;

	setEnvironment(env: { [key: string]: string | undefined }, isTrusted: boolean): void {
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
		this._onDidChangeEnv.fire({ value: Object.fromEntries(this._env), isTrusted: isTrusted });
	}

	startEnvironmentSingleVar(isTrusted: boolean): void {
		this._pendingEnv = new Map();
	}
	setEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		if (key !== undefined && value !== undefined) {
			this._pendingEnv?.set(key, value);
		}
	}
	endEnvironmentSingleVar(isTrusted: boolean): void {
		if (!this._pendingEnv) {
			return;
		}
		this.applyEnvironmentDiff(this._pendingEnv, isTrusted);
		this._pendingEnv = undefined;
	}

	deleteEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		if (key !== undefined && value !== undefined) {
			this._env.delete(key);
			this._pendingEnv?.delete(key);
			this._onDidChangeEnv.fire({ value: Object.fromEntries(this._env), isTrusted: isTrusted });
		}
		return;
	}

	clearEnvironmentVars(isTrusted: boolean): void {
		this._pendingEnv?.clear();
		this._env.clear();
		return;
	}

	// Make sure to update this.env to the latest, fire event if there is a diff
	applyEnvironmentDiff(env: Map<string, string>, isTrusted: boolean): void {

		let envDiffers: boolean = false;

		for (const [key, value] of env.entries()) {
			if (this._env.has(key) && this._env.get(key) === value) {
				// Do nothing
			} else if (this._env.has(key) && value !== this._env.get(key)) {
				this._env.set(key, value);
				envDiffers = true;
			} else if (!this._env.has(key)) {
				this._env.set(key, value);
				envDiffers = true;
			}
		}

		if (envDiffers) {
			this._onDidChangeEnv.fire({ value: Object.fromEntries(this._env), isTrusted: isTrusted });
			return;
		}
	}
}
