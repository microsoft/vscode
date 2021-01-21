/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { TerminalServiceClient } from '@gitpod/supervisor-api-grpc/lib/terminal_grpc_pb';
import { ShutdownTerminalRequest, GetTerminalRequest, ListenTerminalRequest, ListenTerminalResponse, OpenTerminalRequest, OpenTerminalResponse, SetTerminalSizeRequest, Terminal, TerminalSize, WriteTerminalRequest } from '@gitpod/supervisor-api-grpc/lib/terminal_pb';
import { status } from '@grpc/grpc-js';
import * as util from 'util';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { IRemoteTerminalProcessEvent, IRemoteTerminalProcessReplayEvent } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { ITerminalChildProcess, ITerminalLaunchError } from 'vs/workbench/contrib/terminal/common/terminal';

export interface OpenSupervisorTerminalProcessOptions {
	shell: string
	shellArgs: string[]
	env: platform.IProcessEnvironment
	cols: number
	rows: number
}

/**
 * See src/vs/workbench/contrib/terminal/node/terminalProcess.ts for a reference implementation
 */
export class SupervisorTerminalProcess extends DisposableStore implements ITerminalChildProcess {

	private exitCode: number | undefined;
	private closeTimeout: any;
	alias?: string;

	private readonly _onProcessData = this.add(new Emitter<string>());
	get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit = this.add(new Emitter<number>());
	get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessReady = this.add(new Emitter<{ pid: number, cwd: string }>());
	get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = this.add(new Emitter<string>());
	get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	private readonly _onEvent = this.add(new Emitter<IRemoteTerminalProcessEvent>({
		onListenerDidAdd: (_: Emitter<IRemoteTerminalProcessEvent>, listener: (e: IRemoteTerminalProcessEvent) => any) => {
			this.listen();
			listener(this.replay());
		},
		onLastListenerRemove: () => {
			if (!this.shouldPersistTerminal) {
				this.shutdownImmediate();
			}
		}
	}));
	get onEvent(): Event<IRemoteTerminalProcessEvent> { return this._onEvent.event; }

	constructor(
		readonly id: number,
		private readonly terminalServiceClient: TerminalServiceClient,
		private initialCwd: string,
		private readonly workspaceId: string,
		private readonly workspaceName: string,
		readonly shouldPersistTerminal: boolean,
		private readonly openOptions?: OpenSupervisorTerminalProcessOptions
	) {
		super();
		this.onProcessReady(e => this._onEvent.fire({
			type: 'ready',
			...e
		}));
		this.onProcessTitleChanged(title => this._onEvent.fire({
			type: 'titleChanged',
			title
		}));
		this.onProcessData(data => this._onEvent.fire({
			type: 'data',
			data
		}));
		this.onProcessExit(exitCode => this._onEvent.fire({
			type: 'exit',
			exitCode
		}));
		// TODO execCommand
		// TODO orphan?
	}

	async start(): Promise<ITerminalLaunchError | undefined> {
		try {
			if (!this.openOptions) {
				return {
					message: 'launch configuration is missing'
				};
			}
			const request = new OpenTerminalRequest();
			request.setShell(this.openOptions.shell);
			request.setShellArgsList(this.openOptions.shellArgs);
			request.setWorkdir(this.initialCwd);
			for (const name in this.openOptions.env) {
				request.getEnvMap().set(name, this.openOptions.env[name]);
			}
			request.getAnnotationsMap().set('workspaceId', this.workspaceId);
			request.getAnnotationsMap().set('workspaceName', this.workspaceName);
			request.getAnnotationsMap().set('shouldPersistTerminal', String(this.shouldPersistTerminal));
			const { cols, rows } = this.openOptions;
			if (!(typeof cols !== 'number' || typeof rows !== 'number' || isNaN(cols) || isNaN(rows))) {
				const size = new TerminalSize();
				size.setCols(cols);
				size.setRows(rows);
				request.setSize(size);
			}
			const response = await util.promisify<OpenTerminalRequest, OpenTerminalResponse>(this.terminalServiceClient.open.bind(this.terminalServiceClient))(request);
			this.alias = response.getTerminal()!.getAlias();
			this.initialCwd = response.getTerminal()!.getCurrentWorkdir() || response.getTerminal()!.getInitialWorkdir();

			this._onProcessReady.fire({ pid: response.getTerminal()!.getPid(), cwd: this.initialCwd });
			const title = response.getTerminal()!.getTitle();
			if (title) {
				// Send initial timeout async to give event listeners a chance to init
				setTimeout(() => {
					this._onProcessTitleChanged.fire(title);
				}, 0);
			}
			return undefined;
		} catch (err) {
			console.error(`code server: ${this.id} terminal: failed to open:`, err);
			return { message: `A native exception occurred during launch (${err.message})` };
		}
	}

	private listening = false;
	private stopListen: (() => void) | undefined;
	private async listen(): Promise<void> {
		if (this.listening) {
			return;
		}
		this.listening = true;
		if (!this.alias) {
			await new Promise(resolve => {
				if (this['_isDisposed']) {
					return;
				}
				this.add({ dispose: () => resolve(undefined) });
				const readyListener = this.onProcessReady(() => {
					readyListener.dispose();
					resolve(undefined);
				});
				this.add(readyListener);
			});
		}
		if (this['_isDisposed'] || !this.alias) {
			return;
		}
		const alias = this.alias;
		this.add({
			dispose: () => {
				const { stopListen } = this;
				if (stopListen) {
					// see https://github.com/grpc/grpc-node/issues/1652#issuecomment-749237943
					setImmediate(stopListen);
				}
				this.stopListen = undefined;
			}
		});
		while (true) {
			let notFound = false;
			let exitCode: number | undefined;
			try {
				await new Promise((resolve, reject) => {
					if (this['_isDisposed']) {
						return;
					}
					const request = new ListenTerminalRequest();
					request.setAlias(alias);
					const stream = this.terminalServiceClient.listen(request);
					this.stopListen = stream.cancel.bind(stream);
					stream.on('end', resolve);
					stream.on('error', reject);
					stream.on('data', (response: ListenTerminalResponse) => {
						if (response.hasTitle()) {
							const title = response.getTitle();
							if (title) {
								this._onProcessTitleChanged.fire(title);
							}
						} else if (response.hasData()) {
							let data = '';
							const buffer = response.getData();
							if (typeof buffer === 'string') {
								data += buffer;
							} else {
								data += Buffer.from(buffer).toString();
							}
							if (data !== '') {
								this.fireProcessData(data);
							}
						} else if (response.hasExitCode()) {
							exitCode = response.getExitCode();
						}
					});
				});
			} catch (e) {
				notFound = 'code' in e && e.code === status.NOT_FOUND;
				if (!this['_isDisposed'] && !notFound && !('code' in e && e.code === status.CANCELLED)) {
					console.error(`code server: ${this.id}:${alias} terminal: listening failed:`, e);
				}
			} finally {
				this.stopListen = undefined;
			}
			if (this['_isDisposed']) {
				return;
			}
			if (notFound) {
				this.shutdownImmediate();
			} else if (typeof exitCode !== undefined) {
				this.exitCode = exitCode;
				this.shutdownGracefully();
			}
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}

	// Allow any trailing data events to be sent before the exit event is sent.
	// See https://github.com/Tyriar/node-pty/issues/72
	private shutdownGracefully() {
		if (this.closeTimeout) {
			clearTimeout(this.closeTimeout);
		}
		this.closeTimeout = setTimeout(() => this.shutdownImmediate(), 250);
	}

	private async shutdownImmediate(): Promise<void> {
		if (this['_isDisposed'] || !this.alias) {
			return;
		}
		// Attempt to kill the pty, it may have already been killed at this
		// point but we want to make sure
		try {
			const request = new ShutdownTerminalRequest();
			request.setAlias(this.alias);
			await util.promisify(this.terminalServiceClient.shutdown.bind(this.terminalServiceClient))(request);
		} catch (e) {
			if (e && e.code === status.NOT_FOUND) {
				// Swallow, the pty has already been killed
			} else {
				console.error(`code server: ${this.id}:${this.alias} terminal: shutdown failed:`, e);
			}
		}
		this._onProcessExit.fire(this.exitCode || 0);
		this.dispose();
	}

	shutdown(immediate: boolean): void {
		if (immediate) {
			this.shutdownImmediate();
		} else {
			this.shutdownGracefully();
		}
	}

	input(data: string): void {
		if (this['_isDisposed'] || !this.alias) {
			return;
		}
		const request = new WriteTerminalRequest();
		request.setAlias(this.alias);
		request.setStdin(Buffer.from(data));
		this.terminalServiceClient.write(request, e => {
			if (e && e.code !== status.NOT_FOUND) {
				console.error(`code server: ${this.id}:${this.alias} terminal: write failed:`, e);
			}
		});
	}

	resize(cols: number, rows: number): void {
		if (this['_isDisposed'] || !this.alias) {
			return;
		}
		if (typeof cols !== 'number' || typeof rows !== 'number' || isNaN(cols) || isNaN(rows)) {
			return;
		}
		const request = new SetTerminalSizeRequest();
		request.setAlias(this.alias);
		const size = new TerminalSize();
		size.setCols(Math.max(cols, 1));
		size.setRows(Math.max(rows, 1));
		request.setSize(size);
		request.setForce(true);
		this.terminalServiceClient.setSize(request, e => {
			if (e && e.code !== status.NOT_FOUND) {
				console.error(`code server: ${this.id}:${this.alias} terminal: resize failed:`, e);
			}
		});
	}

	getInitialCwd(): Promise<string> {
		return Promise.resolve(this.initialCwd);
	}

	async getCwd(): Promise<string> {
		if (this['_isDisposed'] || !this.alias) {
			return this.initialCwd;
		}
		try {
			const request = new GetTerminalRequest();
			request.setAlias(this.alias);
			const terminal = await util.promisify<GetTerminalRequest, Terminal>(this.terminalServiceClient.get.bind(this.terminalServiceClient))(request);
			return terminal.getCurrentWorkdir();
		} catch {
			return this.initialCwd;
		}
	}

	getLatency(): Promise<number> {
		return Promise.resolve(0);
	}

	private fireProcessData(data: string): void {
		this._onProcessData.fire(data);
		if (this.closeTimeout) {
			clearTimeout(this.closeTimeout);
			this.shutdownGracefully();
		}
		this.record(data);
	}

	private recording = '';
	private readonly maxRecodingSize = 256 << 10;
	private recordingOffset = 0;
	private replay(): IRemoteTerminalProcessReplayEvent {
		return {
			type: 'replay',
			events: [{
				cols: 0,
				rows: 0,
				data: this.recording
			}]
		};
	}
	private record(buf: string): void {
		// If the buffer is larger than ours, then we only care
		// about the last size bytes anyways
		if (buf.length > this.maxRecodingSize) {
			buf = buf.substr(buf.length - this.maxRecodingSize);
		}

		// Copy in place
		const remainingOffset = this.maxRecodingSize - this.recordingOffset;
		this.recording = this.recording.substr(0, this.recordingOffset) + buf;
		if (buf.length > remainingOffset) {
			this.recording = buf.substr(0, remainingOffset) + this.recording.substr(remainingOffset);
		}

		// Update location of the cursor
		this.recordingOffset = (this.recordingOffset + buf.length) % this.maxRecodingSize;
	}

}
