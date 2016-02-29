/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Action} from 'vs/base/common/actions';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {MainThreadService as CommonMainThreadService} from 'vs/platform/thread/common/mainThreadService';
import pluginsIPC = require('vs/platform/plugins/common/ipcRemoteCom');
import marshalling = require('vs/base/common/marshalling');
import strings = require('vs/base/common/strings');
import objects = require('vs/base/common/objects');
import uri from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IWorkspaceContextService, IConfiguration} from 'vs/platform/workspace/common/workspace';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import ports = require('vs/base/node/ports');

import cp = require('child_process');
import {ipcRenderer as ipc} from 'electron';

export const PLUGIN_LOG_BROADCAST_CHANNEL = 'vscode:pluginLog';
export const PLUGIN_ATTACH_BROADCAST_CHANNEL = 'vscode:pluginAttach';

// Enable to see detailed message communication between window and plugin host
const logPluginHostCommunication = false;

export interface ILogEntry {
	type: string;
	severity: string;
	arguments: any;
}

export class MainThreadService extends CommonMainThreadService {
	private pluginHostProcessManager: PluginHostProcessManager;
	private remoteCom: pluginsIPC.IPluginsIPC;

	constructor(contextService: IWorkspaceContextService, messageService: IMessageService, windowService: IWindowService) {
		super(contextService, 'vs/editor/common/worker/editorWorkerServer', 1);

		this.pluginHostProcessManager = new PluginHostProcessManager(contextService, messageService, windowService);

		let logCommunication = logPluginHostCommunication || contextService.getConfiguration().env.logPluginHostCommunication;

		// Message: Window --> Plugin Host
		this.remoteCom = pluginsIPC.create((msg) => {
			if (logCommunication) {
				console.log('%c[Window \u2192 Plugin]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			this.pluginHostProcessManager.postMessage(msg);
		});

		// Message: Plugin Host --> Window
		this.pluginHostProcessManager.startPluginHostProcess((msg) => {
			if (logCommunication) {
				console.log('%c[Plugin \u2192 Window]%c[len: ' + strings.pad(msg.length, 5, ' ') + ']', 'color: darkgreen', 'color: grey', msg);
			}

			this.remoteCom.handle(msg);
		});

		this.remoteCom.setManyHandler(this);
	}

	public dispose(): void {
		this.pluginHostProcessManager.terminate();
	}

	protected _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this.remoteCom, id, descriptor);
	}
}

class PluginHostProcessManager {
	private messageService: IMessageService;
	private contextService: IWorkspaceContextService;
	private windowService: IWindowService;

	private initializePluginHostProcess: TPromise<cp.ChildProcess>;
	private pluginHostProcessHandle: cp.ChildProcess;
	private initializeTimer: number;

	private lastPluginHostError: string;
	private unsentMessages: any[];
	private terminating: boolean;

	private isPluginDevelopmentHost: boolean;

	constructor(contextService: IWorkspaceContextService, messageService: IMessageService, windowService: IWindowService) {
		this.messageService = messageService;
		this.contextService = contextService;
		this.windowService = windowService;

		// handle plugin host lifecycle a bit special when we know we are developing an extension that runs inside
		this.isPluginDevelopmentHost = !!this.contextService.getConfiguration().env.pluginDevelopmentPath;

		this.unsentMessages = [];
	}

	public startPluginHostProcess(onPluginHostMessage: (msg: any) => void): void {
		let config = this.contextService.getConfiguration();
		let isDev = !config.env.isBuilt || !!config.env.pluginDevelopmentPath;
		let isTestingFromCli = !!config.env.pluginTestsPath && !config.env.debugBrkPluginHost;

		let opts: any = {
			env: objects.mixin(objects.clone(process.env), { AMD_ENTRYPOINT: 'vs/workbench/node/pluginHostProcess', PIPE_LOGGING: 'true', VERBOSE_LOGGING: true })
		};

		// Help in case we fail to start it
		if (isDev) {
			this.initializeTimer = setTimeout(() => {
				const msg = config.env.debugBrkPluginHost ? nls.localize('pluginHostProcess.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.") : nls.localize('pluginHostProcess.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

				this.messageService.show(Severity.Warning, msg);
			}, 10000);
		}

		// Initialize plugin host process with hand shakes
		this.initializePluginHostProcess = new TPromise<cp.ChildProcess>((c, e) => {

			// Resolve additional execution args (e.g. debug)
			return this.resolveDebugPort(config, (port) => {
				if (port) {
					opts.execArgv = ['--nolazy', (config.env.debugBrkPluginHost ? '--debug-brk=' : '--debug=') + port];
				}

				// Run Plugin Host as fork of current process
				this.pluginHostProcessHandle = cp.fork(uri.parse(require.toUrl('bootstrap')).fsPath, ['--type=pluginHost'], opts);

				// Notify debugger that we are ready to attach to the process if we run a development plugin
				if (config.env.pluginDevelopmentPath && port) {
					this.windowService.broadcast({
						channel: PLUGIN_ATTACH_BROADCAST_CHANNEL,
						payload: {
							port: port
						}
					}, config.env.pluginDevelopmentPath /* target */);
				}

				// Messages from Plugin host
				this.pluginHostProcessHandle.on('message', (msg) => {

					// 1) Host is ready to receive messages, initialize it
					if (msg === 'ready') {
						if (this.initializeTimer) {
							window.clearTimeout(this.initializeTimer);
						}

						let initPayload = marshalling.stringify({
							parentPid: process.pid,
							contextService: {
								workspace: this.contextService.getWorkspace(),
								configuration: this.contextService.getConfiguration(),
								options: this.contextService.getOptions()
							},
						});

						this.pluginHostProcessHandle.send(initPayload);
					}

					// 2) Host is initialized
					else if (msg === 'initialized') {
						this.unsentMessages.forEach(m => this.postMessage(m));
						this.unsentMessages = [];

						c(this.pluginHostProcessHandle);
					}

					// Support logging from plugin host
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
						// [Plugin Host] to the front because it breaks substitution.
						let consoleArgs = [];
						if (typeof args[0] === 'string' && args[0].indexOf('%') >= 0) {
							consoleArgs = [`%c[Plugin Host]%c ${args[0]}`, 'color: blue', 'color: black', ...args.slice(1)];
						} else {
							consoleArgs = ['%c[Plugin Host]', 'color: blue', ...args];
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
							}, config.env.pluginDevelopmentPath /* target */);
						}
					}

					// Any other message goes to the callback
					else {
						onPluginHostMessage(msg);
					}
				});

				// Lifecycle
				let onExit = () => this.terminate();
				process.once('exit', onExit);

				this.pluginHostProcessHandle.on('error', (err) => {
					let errorMessage = errors.toErrorMessage(err);
					if (errorMessage === this.lastPluginHostError) {
						return; // prevent error spam
					}

					this.lastPluginHostError = errorMessage;

					this.messageService.show(Severity.Error, nls.localize('pluginHostProcess.error', "Error from the extension host: {0}", errorMessage));
				});

				this.pluginHostProcessHandle.on('exit', (code: any, signal: any) => {
					process.removeListener('exit', onExit);

					if (!this.terminating) {

						// Unexpected termination
						if (!this.isPluginDevelopmentHost) {
							this.messageService.show(Severity.Error, {
								message: nls.localize('pluginHostProcess.crash', "Extension host terminated unexpectedly. Please reload the window to recover."),
								actions: [new Action('reloadWindow', nls.localize('reloadWindow', "Reload Window"), null, true, () => { this.windowService.getWindow().reload(); return TPromise.as(null); })]
							});
							console.error('Plugin host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
						}

						// Expected development plugin termination: When the plugin host goes down we also shutdown the window
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
		if (typeof config.env.debugPluginHostPort === 'number') {
			return ports.findFreePort(config.env.debugPluginHostPort, 10 /* try 10 ports */, (port) => {
				if (!port) {
					console.warn('%c[Plugin Host] %cCould not find a free port for debugging', 'color: blue', 'color: black');

					return clb(void 0);
				}

				if (port !== config.env.debugPluginHostPort) {
					console.warn('%c[Plugin Host] %cProvided debugging port ' + config.env.debugPluginHostPort + ' is not free, using ' + port + ' instead.', 'color: blue', 'color: black');
				}

				if (config.env.debugBrkPluginHost) {
					console.warn('%c[Plugin Host] %cSTOPPED on first line for debugging on port ' + port, 'color: blue', 'color: black');
				} else {
					console.info('%c[Plugin Host] %cdebugger listening on port ' + port, 'color: blue', 'color: black');
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
		if (this.initializePluginHostProcess) {
			this.initializePluginHostProcess.done(p => p.send(msg));
		} else {
			this.unsentMessages.push(msg);
		}
	}

	public terminate(): void {
		this.terminating = true;

		if (this.pluginHostProcessHandle) {
			this.pluginHostProcessHandle.send({
				type: '__$terminate'
			});
		}
	}
}