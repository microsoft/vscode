/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellEnvDetectionCapability, TerminalCapability } from './capabilities.js';
import { Emitter } from '../../../../base/common/event.js';

export class ShellEnvDetectionCapability extends Disposable implements IShellEnvDetectionCapability {
	// Ideal: when we create ShellEnvDetectionCapability, include set in constructor,
	// provide way to do diff for shell that cannot.

	readonly type = TerminalCapability.ShellEnvironmentDetection;

	private readonly _env: Map<string, string> = new Map();

	get envs(): Map<string, string> {
		return this._env;
	}

	private readonly _onDidChangeEnv = this._register(new Emitter<string>());
	readonly onDidChangeEnv = this._onDidChangeEnv.event;


	setEnvironment(envs: { [key: string]: string | undefined }): void {
		// Should probably go through received envs, see if they exist in _envs,
		// If doesn't already exit in _envs, then add to map

		// TODO: Convert to map

		// convert to event and fire event


	}

	applyEnvironmentDiff(envs: { [key: string]: string | undefined }): void {
		// TODO: Implement

		//look at every key, fire event after applying everything.
	}


}
