/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
//import * as nls from 'vscode-nls';
import * as util from 'util';


const PATTERN = 'listening on.* (https?://\\S+|[0-9]+)'; // matches "listening on port 3000" or "Now listening on: https://localhost:5001"
const URI_FORMAT = 'http://localhost:%s';
const WEB_ROOT = '${workspaceFolder}';

interface ServerReadyAction {
	pattern: string;
	action?: 'openExternally' | 'debugWithChrome';
	uriFormat?: string;
	webRoot?: string;
}

class ServerReadyDetector extends vscode.Disposable {
	static detectors = new Map<vscode.DebugSession, ServerReadyDetector>();

	private hasFired = false;
	private regexp: RegExp;
	private disposables: vscode.Disposable[] = [];

	static start(session: vscode.DebugSession): ServerReadyDetector | undefined {
		if (session.configuration.serverReadyAction) {
			let detector = ServerReadyDetector.detectors.get(session);
			if (!detector) {
				detector = new ServerReadyDetector(session);
				ServerReadyDetector.detectors.set(session, detector);
			}
			return detector;
		}
		return undefined;
	}

	static stop(session: vscode.DebugSession): void {
		let detector = ServerReadyDetector.detectors.get(session);
		if (detector) {
			ServerReadyDetector.detectors.delete(session);
			detector.dispose();
		}
	}

	private constructor(private session: vscode.DebugSession) {
		super(() => this.internalDispose());

		this.regexp = new RegExp(session.configuration.serverReadyAction.pattern || PATTERN);
	}

	private internalDispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}

	trackTerminals() {
		// TODO: listen only on the Terminal associated with the debug session
		vscode.window.terminals.forEach(terminal => {
			this.disposables.push(terminal.onDidWriteData(s => {
				this.detectPattern(s);
			}));
		});
	}

	detectPattern(s: string): void {

		if (!this.hasFired) {
			const result = this.regexp.exec(s);
			if (result && result.length === 2) {
				this.openExternalWithString(this.session, result[1]);
				this.hasFired = true;
				this.internalDispose();
			}
		}
	}

	private openExternalWithString(session: vscode.DebugSession, portOrUriString: string) {

		if (portOrUriString) {
			if (/^[0-9]+$/.test(portOrUriString)) {
				const args: ServerReadyAction = session.configuration.serverReadyAction;
				portOrUriString = util.format(args.uriFormat || URI_FORMAT, portOrUriString);
			}
			this.openExternalWithUri(session, portOrUriString);
		}
	}

	private openExternalWithUri(session: vscode.DebugSession, uri: string) {

		const args: ServerReadyAction = session.configuration.serverReadyAction;
		switch (args.action || 'openExternally') {
			case 'openExternally':
				vscode.env.openExternal(vscode.Uri.parse(uri));
				break;
			case 'debugWithChrome':
				vscode.debug.startDebugging(session.workspaceFolder, {
					type: 'chrome',
					name: 'Chrome Debug',
					request: 'launch',
					url: uri,
					webRoot: args.webRoot || WEB_ROOT
				});
				break;
			default:
				// not supported
				break;
		}
	}
}

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.debug.onDidChangeActiveDebugSession(session => {
		if (session && session.configuration.serverReadyAction) {
			const detector = ServerReadyDetector.start(session);
			if (detector) {
				detector.trackTerminals();
			}
		}
	}));

	context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => {
		ServerReadyDetector.stop(session);
	}));

	const trackers = new Set<string>();

	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('*', {
		resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration) {
			if (debugConfiguration.type && debugConfiguration.serverReadyAction) {
				if (!trackers.has(debugConfiguration.type)) {
					trackers.add(debugConfiguration.type);
					startTrackerForType(context, debugConfiguration.type);
				}
			}
			return debugConfiguration;
		}
	}));
}

function startTrackerForType(context: vscode.ExtensionContext, type: string) {

	// scan debug console output for a PORT message
	context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory(type, {
		createDebugAdapterTracker(session: vscode.DebugSession) {
			const detector = ServerReadyDetector.start(session);
			if (detector) {
				return {
					onDidSendMessage: m => {
						if (m.type === 'event' && m.event === 'output' && m.body.output) {
							detector.detectPattern(m.body.output);
						}
					}
				};
			}
			return undefined;
		}
	}));
}
