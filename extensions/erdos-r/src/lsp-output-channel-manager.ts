/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const LSP_OUTPUT_CHANNEL_DESCRIPTOR = 'Language Server';

export class RLspOutputChannelManager {
	private static _instance: RLspOutputChannelManager;

	private _channels: Map<string, vscode.OutputChannel> = new Map();

	private constructor() { }

	static get instance(): RLspOutputChannelManager {
		if (!RLspOutputChannelManager._instance) {
			RLspOutputChannelManager._instance = new RLspOutputChannelManager();
		}
		return RLspOutputChannelManager._instance;
	}

	getOutputChannel(sessionName: string, sessionMode: string): vscode.OutputChannel {
		const key = `${sessionName}-${sessionMode}`;
		let out = this._channels.get(key);

		if (!out) {
			const name = `${sessionName}: ${LSP_OUTPUT_CHANNEL_DESCRIPTOR} (${sessionMode.charAt(0).toUpperCase() + sessionMode.slice(1)})`;
			out = vscode.window.createOutputChannel(name);
			this._channels.set(key, out);
		}

		return out;
	}
}
