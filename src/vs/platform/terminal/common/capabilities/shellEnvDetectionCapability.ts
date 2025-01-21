/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
// eslint-disable-next-line local/code-import-patterns
import { TerminalShellIntegrationEnvironment } from 'vscode'; // Maybe illegal..

export class ShellEnvDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	readonly type = TerminalCapability.ShellEnvDetection;

	private _pendingEnv: Map<string, string> | undefined;
	private _env: Map<string, string> = new Map();
	private _isTrusted: boolean = false;
	get env(): { value: { [key: string]: string }; isTrusted: boolean } {
		return { value: Object.fromEntries(this._env), isTrusted: this._isTrusted };
	}

	private readonly _onDidChangeEnv = this._register(new Emitter<TerminalShellIntegrationEnvironment>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event; // TODO: Why type complains only here in this file? Firing seems fine.

	setEnvironment(env: { [key: string]: string | undefined }, isTrusted: boolean): void {
		if (!isTrusted) {
			return;
		}

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
		if (!isTrusted) {
			return;
		}
		this._pendingEnv = new Map();
	}
	setEnvironmentSingleVar(key: string, value: string | undefined, isTrusted: boolean): void {
		if (!isTrusted) {
			return;
		}
		if (key !== undefined && value !== undefined) {
			this._pendingEnv?.set(key, value);
		}
	}
	endEnvironmentSingleVar(isTrusted: boolean): void {
		if (!isTrusted) {
			return;
		}
		if (!this._pendingEnv) {
			return;
		}
		this._env = this._pendingEnv;
		this._pendingEnv = undefined;
		this._onDidChangeEnv.fire({ value: Object.fromEntries(this._env), isTrusted: isTrusted });
	}
}
