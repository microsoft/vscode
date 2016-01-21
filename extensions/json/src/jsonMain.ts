/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import {workspace, Disposable, ExtensionContext} from 'vscode';
import {LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType} from 'vscode-languageclient';

namespace TelemetryNotification {
	export const type: NotificationType<{ key: string, data: any }> = { get method() { return 'telemetry'; } };
}

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for json documents
		documentSelector: ['json'],
		synchronize: {
			// Synchronize the setting section 'json' to the server
			configurationSection: 'json',

			fileEvents: workspace.createFileSystemWatcher('**/.json')
		}
	}

	// Create the language client and start the client.
	var client = new LanguageClient('JSON Server', serverOptions, clientOptions);
	client.onNotification(TelemetryNotification.type, (e) => {
		// to be done
	});

	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}