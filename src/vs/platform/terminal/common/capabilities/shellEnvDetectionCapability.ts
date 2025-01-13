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

	private readonly _env: Map<string, string> = new Map();
	get env(): Map<string, string> { return this._env; }

	private readonly _onDidChangeEnv = this._register(new Emitter<Map<string, string>>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;

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
		this._onDidChangeEnv.fire(this._env);
	}
}
