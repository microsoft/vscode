/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const LSP_OUTPUT_CHANNEL_DESCRIPTOR = 'Language Server';

export class PythonLspOutputChannelManager {
    private static _instance: PythonLspOutputChannelManager;

    private _channels: Map<string, vscode.LogOutputChannel> = new Map();

    private constructor() {}

    static get instance(): PythonLspOutputChannelManager {
        if (!PythonLspOutputChannelManager._instance) {
            PythonLspOutputChannelManager._instance = new PythonLspOutputChannelManager();
        }
        return PythonLspOutputChannelManager._instance;
    }

    getOutputChannel(sessionName: string, sessionMode: string): vscode.LogOutputChannel {
        const key = `${sessionName}-${sessionMode}`;
        let out = this._channels.get(key);

        if (!out) {
            const name = `${sessionName}: ${LSP_OUTPUT_CHANNEL_DESCRIPTOR} (${
                sessionMode.charAt(0).toUpperCase() + sessionMode.slice(1)
            })`;
            out = vscode.window.createOutputChannel(name, { log: true });
            this._channels.set(key, out);
        }

        return out;
    }
}
