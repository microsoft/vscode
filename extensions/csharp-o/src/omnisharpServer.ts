/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {EventEmitter} from 'events';
import {ChildProcess, exec} from 'child_process';
import {request} from 'http';
import {dirname} from 'path';
import {ReadLine, createInterface} from 'readline';
import omnisharpLauncher from './omnisharpServerLauncher';
import {Disposable, CancellationToken, OutputChannel, workspace, window} from 'vscode';
import {ErrorMessage, UnresolvedDependenciesMessage, MSBuildProjectDiagnostics, ProjectInformationResponse} from './protocol';
import getLaunchTargets, {LaunchTarget} from './launchTargetFinder';


enum ServerState {
	Starting,
	Started,
	Stopped
}

interface Request {
	path: string;
	data?: any;
	onSuccess: Function;
	onError: Function;
	_enqueued: number;
}

export abstract class OmnisharpServer {

	private _eventBus = new EventEmitter();
	private _start: Promise<void>;
	private _state: ServerState = ServerState.Stopped;
	private _solutionPath: string;
	private _queue: Request[] = [];
	private _isProcessingQueue = false;
	private _channel: OutputChannel;

	protected _serverProcess: ChildProcess;
	protected _extraArgv: string[];

	constructor() {
		this._extraArgv = [];
		this._channel = window.createOutputChannel('OmniSharp Log');
	}

	public isRunning(): boolean {
		return this._state === ServerState.Started;
	}

	private _getState(): ServerState {
		return this._state;
	}

	private _setState(value: ServerState) : void {
		if (typeof value !== 'undefined' && value !== this._state) {
			this._state = value;
			this._fireEvent('stateChanged', this._state);
		}
	}

	public getSolutionPathOrFolder(): string {
		return this._solutionPath;
	}

	public getChannel(): vscode.OutputChannel {
		return this._channel;
	}

	public onStdout(listener: (e: string) => any, thisArg?: any) {
		return this._addListener('stdout', listener, thisArg);
	}

	public onStderr(listener: (e: string) => any, thisArg?: any) {
		return this._addListener('stderr', listener, thisArg);
	}

	public onError(listener: (e: ErrorMessage) => any, thisArg?: any) {
		return this._addListener('Error', listener, thisArg);
	}

	public onServerError(listener: (err: any) => any, thisArg?: any) {
		return this._addListener('ServerError', listener, thisArg);
	}

	public onUnresolvedDependencies(listener: (e: UnresolvedDependenciesMessage) => any, thisArg?:any) {
		return this._addListener('UnresolvedDependencies', listener, thisArg);
	}

	public onBeforePackageRestore(listener: () => any, thisArg?: any) {
		return this._addListener('PackageRestoreStarted', listener, thisArg);
	}

	public onPackageRestore(listener: () => any, thisArg?: any) {
		return this._addListener('PackageRestoreFinished', listener, thisArg);
	}

	public onProjectChange(listener: (e: ProjectInformationResponse) => any, thisArg?: any) {
		return this._addListener('ProjectChanged', listener, thisArg);
	}

	public onProjectAdded(listener: (e: ProjectInformationResponse) => any, thisArg?: any) {
		return this._addListener('ProjectAdded', listener, thisArg);
	}

	public onProjectRemoved(listener: (e: ProjectInformationResponse) => any, thisArg?: any) {
		return this._addListener('ProjectRemoved', listener, thisArg);
	}

	public onMsBuildProjectDiagnostics(listener: (e: MSBuildProjectDiagnostics) => any, thisArg?: any) {
		return this._addListener('MsBuildProjectDiagnostics', listener, thisArg);
	}

	public onBeforeServerStart(listener: (e:string) => any) {
		return this._addListener('BeforeServerStart', listener);
	}

	public onServerStart(listener: (e: string) => any) {
		return this._addListener('ServerStart', listener);
	}

	public onServerStop(listener: () => any) {
		return this._addListener('ServerStop', listener);
	}

	public onMultipleLaunchTargets(listener: (targets: LaunchTarget[]) => any, thisArg?: any) {
		return this._addListener('server:MultipleLaunchTargets', listener, thisArg);
	}

	public onOmnisharpStart(listener: () => any) {
		return this._addListener('started', listener);
	}

	private _addListener(event: string, listener: (e: any) => any, thisArg?: any): Disposable {
		listener = thisArg ? listener.bind(thisArg) : listener;
		this._eventBus.addListener(event, listener);
		return new Disposable(() => this._eventBus.removeListener(event, listener));
	}

	protected _fireEvent(event: string, args: any): void {
		this._eventBus.emit(event, args);
	}

	public start(solutionPath: string): Promise<void> {
		if (!this._start) {
			this._start = this._doStart(solutionPath);
		}
		return this._start;
	}

	private _doStart(solutionPath: string): Promise<void> {

		this._setState(ServerState.Starting);
		this._solutionPath = solutionPath;

		var cwd = dirname(solutionPath),
			argv = ['-s', solutionPath, '--hostPID', process.pid.toString(), 'dnx:enablePackageRestore=false'].concat(this._extraArgv);

		this._fireEvent('stdout', `[INFO] Starting OmniSharp at '${solutionPath}'...\n`);
		this._fireEvent('BeforeServerStart', solutionPath);

		return omnisharpLauncher(cwd, argv).then(value => {
			this._serverProcess = value.process;
			this._fireEvent('stdout', `[INFO] Started OmniSharp from '${value.command}' with process id ${value.process.pid}...\n`);
			return this._doConnect();
		}).then(_ => {
			this._fireEvent('ServerStart', solutionPath);
			this._setState(ServerState.Started);
			this._processQueue();
		}, err => {
			this._fireEvent('ServerError', err);
			throw err;
		});
	}

	protected abstract _doConnect(): Promise<OmnisharpServer>;

	public stop(): Promise<void> {

		var ret: Promise<OmnisharpServer>;

		if (!this._serverProcess) {
			// nothing to kill
			ret = Promise.resolve(undefined);

		} else if (/^win/.test(process.platform)) {
			// when killing a process in windows its child
			// processes are *not* killed but become root
			// processes. Therefore we use TASKKILL.EXE
			ret = new Promise<OmnisharpServer>((resolve, reject) => {
				var killer = exec(`taskkill /F /T /PID ${this._serverProcess.pid}`, function (err, stdout, stderr) {
					if (err) {
						return reject(err);
					}
				});
				killer.on('exit', resolve);
				killer.on('error', reject);
			});
		} else {
			this._serverProcess.kill('SIGTERM');
			ret = Promise.resolve(undefined);
		}
		return ret.then(_ => {
			this._start = null;
			this._serverProcess = null;
			this._setState(ServerState.Stopped);
			this._fireEvent('ServerStop', this);
			return;
		});
	}

	public restart(solutionPath: string = this._solutionPath): Promise<void> {
		if (solutionPath) {
			return this.stop().then(() => {
				this.start(solutionPath)
			});
		}
	}

	public autoStart(preferredPath:string): Thenable<void> {
		return getLaunchTargets().then(targets => {
			if (targets.length === 0) {
				return new Promise<void>((resolve, reject) => {
					// 1st watch for files
					let watcher = workspace.createFileSystemWatcher('{**/*.sln,**/project.json}', false, true, true);
					watcher.onDidCreate(uri => {
						watcher.dispose();
						resolve();
					});
				}).then(() => {
					// 2nd try again
					return this.autoStart(preferredPath);
				});
			}

			if (targets.length > 1) {

				for (let target of targets) {
					if (target.target.fsPath === preferredPath) {
						// start preferred path
						return this.restart(preferredPath);
					}
				}

				this._fireEvent('server:MultipleLaunchTargets', targets);
				return Promise.reject<void>(undefined);
			}

			// just start
			return this.restart(targets[0].target.fsPath);
		});
	}

	public makeRequest<R>(path: string, data?: any, token?: CancellationToken): Promise<R> {

		if (this._getState() !== ServerState.Started) {
			return Promise.reject<R>('server has been stopped or not started');
		}

		let request: Request;
		let promise = new Promise<any>((resolve, reject) => {
			request = {
				path,
				data,
				onSuccess: resolve,
				onError: reject,
				_enqueued: Date.now()
			};
			this._queue.push(request);
			// this._statOnRequestStart(request);
			if (this._getState() === ServerState.Started && !this._isProcessingQueue) {
				this._processQueue();
			}
		});

		if (token) {
			token.onCancellationRequested(() => {
				let idx = this._queue.indexOf(request);
				if (idx !== -1) {
					this._queue.splice(idx, 1);
					let err = new Error('Canceled');
					err.message = 'Canceled';
					request.onError(err);
				}
			});
		}

		return promise;
	}

	private _processQueue(): void {

		if (this._queue.length === 0) {
			// nothing to do
			this._isProcessingQueue = false;
			return;
		}

		// signal that we are working on it
		this._isProcessingQueue = true;

		// send next request and recurse when done
		var thisRequest = this._queue.shift();
		this._makeNextRequest(thisRequest.path, thisRequest.data).then(value => {
			thisRequest.onSuccess(value);
			this._processQueue();
			// this._statOnRequestEnd(thisRequest, true);
		}, err => {
			thisRequest.onError(err);
			this._processQueue();
			// this._statOnRequestEnd(thisRequest, false);
		}).catch(err => {
			console.error(err);
			this._processQueue();
		});
	}

	protected abstract _makeNextRequest(path: string, data: any): Promise<any>;

	// private _statOnRequestStart(request: Request): void {
	// 	console.log(`[DEBUG] *enqueuing* request '${request.path}' (queue size is ${this._queue.length})\n`);
	// }

	// private _statOnRequestEnd(request: Request, successfully: boolean): void {
	// 	var duration = Date.now() - request._enqueued,
	// 		state = successfully ? 'successfully' : 'with errors';

	// 	console.log(`[DEBUG] request '${request.path}' finished *${state}* after ${duration}ms\n`);
	// }
}

namespace WireProtocol {

	export interface Packet {
		Type: string;
		Seq: number;
	}

	export interface RequestPacket extends Packet {
		Command: string;
		Arguments: any;
	}

	export interface ResponsePacket extends Packet {
		Command: string;
		Request_seq: number;
		Running: boolean;
		Success: boolean;
		Message: string;
		Body: any;
	}

	export interface EventPacket extends Packet {
		Event: string;
		Body: any;
	}
}

export class StdioOmnisharpServer extends OmnisharpServer {

	private static _seqPool = 1;
	private static StartupTimeout = 1000 * 60;
	private static ResponsePacketTimeout = 1000 * 60 * 15; // helps debugging

	private _rl: ReadLine;
	private _activeRequest: { [seq: number]: { onSuccess: Function; onError: Function; } } = Object.create(null);
	private _callOnStop: Function[] = [];

	constructor() {
		super();

		// extra argv
		this._extraArgv.push('--stdio');
	}

	public stop(): Promise<void> {
		while (this._callOnStop.length) {
			this._callOnStop.pop()();
		}
		return super.stop();
	}

	protected _doConnect(): Promise<OmnisharpServer> {

		this._serverProcess.stderr.on('data', (data: any) => this._fireEvent('stderr', String(data)));

		this._rl = createInterface({
			input: this._serverProcess.stdout,
			output: this._serverProcess.stdin,
			terminal: false
		});

		var p = new Promise<OmnisharpServer>((resolve, reject) => {
			var listener: Disposable;

			// timeout logic
			var handle = setTimeout(() => {
				listener && listener.dispose();
				reject(new Error('Failed to start OmniSharp'));
			}, StdioOmnisharpServer.StartupTimeout);

			// handle started-event
			listener = this.onOmnisharpStart(() => {
				listener && listener.dispose();
				clearTimeout(handle);
				resolve(this);
			});
		});

		this._startListening();

		return p;
	}

	private _startListening(): void {

		var onLineReceived = (line: string) => {
			if (line[0] !== '{') {
				this._fireEvent('stdout', `${line}\n`);
				return;
			}

			var packet: WireProtocol.Packet;
			try {
				packet = JSON.parse(line);
			} catch (e) {
				// not json
				return;
			}

			if (!packet.Type) {
				// bogous packet
				return;
			}

			switch (packet.Type) {
				case 'response':
					this._handleResponsePacket(<WireProtocol.ResponsePacket> packet);
					break;
				case 'event':
					this._handleEventPacket(<WireProtocol.EventPacket> packet);
					break;
				default:
					console.warn('unknown packet: ', packet);
					break;
			}
		};
		this._rl.addListener('line', onLineReceived);
		this._callOnStop.push(() => this._rl.removeListener('line', onLineReceived));
	}

	private _handleResponsePacket(packet: WireProtocol.ResponsePacket): void {

		var requestSeq = packet.Request_seq,
			entry = this._activeRequest[requestSeq];

		if (!entry) {
			console.warn('Received a response WITHOUT a request', packet);
			return;
		}

		delete this._activeRequest[requestSeq];

		if (packet.Success) {
			entry.onSuccess(packet.Body);
		} else {
			entry.onError(packet.Message || packet.Body);
		}
	}

	private _handleEventPacket(packet: WireProtocol.EventPacket): void {

		if (packet.Event === 'log') {
			// handle log events
			var entry = <{ LogLevel: string; Name: string; Message: string; }> packet.Body;
			this._fireEvent('stdout', `[${entry.LogLevel}:${entry.Name}] ${entry.Message}\n`);
			return;
		} else {
			// fwd all other events
			this._fireEvent(packet.Event, packet.Body);
		}
	}

	protected _makeNextRequest(path: string, data: any): Promise<any> {

		var thisRequestPacket: WireProtocol.RequestPacket = {
			Type: 'request',
			Seq: StdioOmnisharpServer._seqPool++,
			Command: path,
			Arguments: data
		};

		return new Promise<any>((c, e) => {

			this._activeRequest[thisRequestPacket.Seq] = {
				onSuccess: c,
				onError: e
			};

			this._serverProcess.stdin.write(JSON.stringify(thisRequestPacket) + '\n');
		});
	}
}
