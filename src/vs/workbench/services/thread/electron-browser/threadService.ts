/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import {Action} from 'vs/base/common/actions';
import {toErrorMessage} from 'vs/base/common/errors';
import {stringify} from 'vs/base/common/marshalling';
import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {findFreePort} from 'vs/base/node/ports';
import {IMainProcessExtHostIPC, create} from 'vs/platform/extensions/common/ipcRemoteCom';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {MainThreadService as CommonMainThreadService} from 'vs/platform/thread/common/mainThreadService';
import {IConfiguration, IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {ChildProcess, fork} from 'child_process';
import {ipcRenderer as ipc} from 'electron';

export const PLUGIN_LOG_BROADCAST_CHANNEL = 'vscode:pluginLog';
export const PLUGIN_ATTACH_BROADCAST_CHANNEL = 'vscode:pluginAttach';

// Enable to see detailed message communication between window and extension host
const logExtensionHostCommunication = false;

export interface ILogEntry {
	type: string;
	severity: string;
	arguments: any;
}

export class MainThreadService extends CommonMainThreadService {
	private extensionHostProcessManager: ExtensionHostProcessManager;
	private remoteCom: IMainProcessExtHostIPC;

	constructor(contextService: IWorkspaceContextService, messageService: IMessageService, windowService: IWindowService) {
		super(contextService, 'vs/editor/common/worker/editorWorkerServer', 1);

		this.extensionHostProcessManager = new ExtensionHostProcessManager(contextService, messageService, windowService);

		let logCommunication = logExtensionHostCommunication || contextService.getConfiguration().env.logExtensionHostCommunication;

		// Message: Window --> Extension Host
		this.remoteCom = create((msg) => {
			if (logCommunication) {
				console.log('%c[Window \u2192 Extension]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			this.extensionHostProcessManager.postMessage(msg);
		});

		// Message: Extension Host --> Window
		this.extensionHostProcessManager.startExtensionHostProcess((msg) => {
			if (logCommunication) {
				console.log('%c[Extension \u2192 Window]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			this.remoteCom.handle(msg);
		});

		this.remoteCom.setManyHandler(this);
	}

	public dispose(): void {
		this.extensionHostProcessManager.terminate();
	}

	protected _registerAndInstantiateExtHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this.remoteCom, id, descriptor);
	}
}

class ExtensionHostProcessManager {
	private messageService: IMessageService;
	private contextService: IWorkspaceContextService;
	private windowService: IWindowService;

	private initializeExtensionHostProcess: TPromise<ChildProcess>;
	private extensionHostProcessHandle: ChildProcess;
	private initializeTimer: number;

	private lastExtensionHostError: string;
	private unsentMessages: any[];
	private terminating: boolean;

	private isExtensionDevelopmentHost: boolean;

	constructor(contextService: IWorkspaceContextService, messageService: IMessageService, windowService: IWindowService) {
		this.messageService = messageService;
		this.contextService = contextService;
		this.windowService = windowService;

		// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
		this.isExtensionDevelopmentHost = !!this.contextService.getConfiguration().env.extensionDevelopmentPath;

		this.unsentMessages = [];
	}

	public startExtensionHostProcess(onExtensionHostMessage: (msg: any) => void): void {
		let config = this.contextService.getConfiguration();
		let isDev = !config.env.isBuilt || !!config.env.extensionDevelopmentPath;
		let isTestingFromCli = !!config.env.extensionTestsPath && !config.env.debugBrkExtensionHost;

		let opts: any = {
			env: objects.mixin(objects.clone(process.env), { AMD_ENTRYPOINT: 'vs/workbench/node/extensionHostProcess', PIPE_LOGGING: 'true', VERBOSE_LOGGING: true })
		};

		// Help in case we fail to start it
		if (isDev) {
			this.initializeTimer = setTimeout(() => {
				const msg = config.env.debugBrkExtensionHost ? nls.localize('extensionHostProcess.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.") : nls.localize('extensionHostProcess.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

				this.messageService.show(Severity.Warning, msg);
			}, 10000);
		}

		// Initialize extension host process with hand shakes
		this.initializeExtensionHostProcess = new TPromise<ChildProcess>((c, e) => {

			// Resolve additional execution args (e.g. debug)
			return this.resolveDebugPort(config, (port) => {
				if (port) {
					opts.execArgv = ['--nolazy', (config.env.debugBrkExtensionHost ? '--debug-brk=' : '--debug=') + port];
				}

				// Run Extension Host as fork of current process
				this.extensionHostProcessHandle = fork(URI.parse(require.toUrl('bootstrap')).fsPath, ['--type=extensionHost'], opts);

				// Notify debugger that we are ready to attach to the process if we run a development extension
				if (config.env.extensionDevelopmentPath && port) {
					this.windowService.broadcast({
						channel: PLUGIN_ATTACH_BROADCAST_CHANNEL,
						payload: {
							port: port
						}
					}, config.env.extensionDevelopmentPath /* target */);
				}

				// Messages from Extension host
				this.extensionHostProcessHandle.on('message', (msg) => {

					// 1) Host is ready to receive messages, initialize it
					if (msg === 'ready') {
						if (this.initializeTimer) {
							window.clearTimeout(this.initializeTimer);
						}

						let initPayload = stringify({
							parentPid: process.pid,
							contextService: {
								workspace: this.contextService.getWorkspace(),
								configuration: this.contextService.getConfiguration(),
								options: this.contextService.getOptions()
							},
						});

						this.extensionHostProcessHandle.send(initPayload);
					}

					// 2) Host is initialized
					else if (msg === 'initialized') {
						this.unsentMessages.forEach(m => this.postMessage(m));
						this.unsentMessages = [];

						c(this.extensionHostProcessHandle);
					}

					// Support logging from extension host
					else if (msg && (<ILogEntry>msg).type === '__$console') {
						let logEntry: ILogEntry = msg;

						let args = [];
						try {
							let parsed = JSON.parse(logEntry.arguments);
							args.push(...Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
						} catch (error) {
							args.push(logEntry.arguments);
						}

						// If the first argument is a string, check for % which indicates that the message
						// uses substitution for variables. In this case, we cannot just inject our colored
						// [Extension Host] to the front because it breaks substitution.
						let consoleArgs = [];
						if (typeof args[0] === 'string' && args[0].indexOf('%') >= 0) {
							consoleArgs = [`%c[Extension Host]%c ${args[0]}`, 'color: blue', 'color: black', ...args.slice(1)];
						} else {
							consoleArgs = ['%c[Extension Host]', 'color: blue', ...args];
						}

						// Send to local console unless we run tests from cli
						if (!isTestingFromCli) {
							console[logEntry.severity].apply(console, consoleArgs);
						}

						// Log on main side if running tests from cli
						if (isTestingFromCli) {
							ipc.send('vscode:log', logEntry);
						}

						// Broadcast to other windows if we are in development mode
						else if (isDev) {
							this.windowService.broadcast({
								channel: PLUGIN_LOG_BROADCAST_CHANNEL,
								payload: logEntry
							}, config.env.extensionDevelopmentPath /* target */);
						}
					}

					// Any other message goes to the callback
					else {
						onExtensionHostMessage(msg);
					}
				});

				// Lifecycle
				let onExit = () => this.terminate();
				process.once('exit', onExit);

				this.extensionHostProcessHandle.on('error', (err) => {
					let errorMessage = toErrorMessage(err);
					if (errorMessage === this.lastExtensionHostError) {
						return; // prevent error spam
					}

					this.lastExtensionHostError = errorMessage;

					this.messageService.show(Severity.Error, nls.localize('extensionHostProcess.error', "Error from the extension host: {0}", errorMessage));
				});

				this.extensionHostProcessHandle.on('exit', (code: any, signal: any) => {
					process.removeListener('exit', onExit);

					if (!this.terminating) {

						// Unexpected termination
						if (!this.isExtensionDevelopmentHost) {
							this.messageService.show(Severity.Error, {
								message: nls.localize('extensionHostProcess.crash', "Extension host terminated unexpectedly. Please reload the window to recover."),
								actions: [new Action('reloadWindow', nls.localize('reloadWindow', "Reload Window"), null, true, () => { this.windowService.getWindow().reload(); return TPromise.as(null); })]
							});
							console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
						}

						// Expected development extension termination: When the extension host goes down we also shutdown the window
						else if (!isTestingFromCli) {
							this.windowService.getWindow().close();
						}

						// When CLI testing make sure to exit with proper exit code
						else {
							ipc.send('vscode:exit', code);
						}
					}
				});
			});
		}, () => this.terminate());
	}

	private resolveDebugPort(config: IConfiguration, clb: (port: number) => void): void {

		// Check for a free debugging port
		if (typeof config.env.debugExtensionHostPort === 'number') {
			return findFreePort(config.env.debugExtensionHostPort, 10 /* try 10 ports */, (port) => {
				if (!port) {
					console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color: black');

					return clb(void 0);
				}

				if (port !== config.env.debugExtensionHostPort) {
					console.warn('%c[Extension Host] %cProvided debugging port ' + config.env.debugExtensionHostPort + ' is not free, using ' + port + ' instead.', 'color: blue', 'color: black');
				}

				if (config.env.debugBrkExtensionHost) {
					console.warn('%c[Extension Host] %cSTOPPED on first line for debugging on port ' + port, 'color: blue', 'color: black');
				} else {
					console.info('%c[Extension Host] %cdebugger listening on port ' + port, 'color: blue', 'color: black');
				}

				return clb(port);
			});
		}

		// Nothing to do here
		else {
			return clb(void 0);
		}
	}

	public postMessage(msg: any): void {
		if (this.initializeExtensionHostProcess) {
			this.initializeExtensionHostProcess.done(p => p.send(msg));
		} else {
			this.unsentMessages.push(msg);
		}
	}

	public terminate(): void {
		this.terminating = true;

		if (this.extensionHostProcessHandle) {
			this.extensionHostProcessHandle.send({
				type: '__$terminate'
			});
		}
	}
}