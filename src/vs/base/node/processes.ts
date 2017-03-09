/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import path = require('path');
import * as cp from 'child_process';
import ChildProcess = cp.ChildProcess;
import exec = cp.exec;
import spawn = cp.spawn;
import { PassThrough } from 'stream';
import { fork } from 'vs/base/node/stdFork';
import nls = require('vs/nls');
import { PPromise, Promise, TPromise, TValueCallback, TProgressCallback, ErrorCallback } from 'vs/base/common/winjs.base';
import * as Types from 'vs/base/common/types';
import { IStringDictionary } from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import * as Objects from 'vs/base/common/objects';
import * as TPath from 'vs/base/common/paths';
import * as Platform from 'vs/base/common/platform';
import { LineDecoder } from 'vs/base/node/decoder';
import { CommandOptions, ForkOptions, SuccessData, Source, TerminateResponse, TerminateResponseCode, Executable } from 'vs/base/common/processes';
export { CommandOptions, ForkOptions, SuccessData, Source, TerminateResponse, TerminateResponseCode };

export interface LineData {
	line: string;
	source: Source;
}

export interface BufferData {
	data: Buffer;
	source: Source;
}

export interface StreamData {
	stdin: NodeJS.WritableStream;
	stdout: NodeJS.ReadableStream;
	stderr: NodeJS.ReadableStream;
}

function getWindowsCode(status: number): TerminateResponseCode {
	switch (status) {
		case 0:
			return TerminateResponseCode.Success;
		case 1:
			return TerminateResponseCode.AccessDenied;
		case 128:
			return TerminateResponseCode.ProcessNotFound;
		default:
			return TerminateResponseCode.Unknown;
	}
}

export function terminateProcess(process: ChildProcess, cwd?: string): TerminateResponse {
	if (Platform.isWindows) {
		try {
			let options: any = {
				stdio: ['pipe', 'pipe', 'ignore']
			};
			if (cwd) {
				options.cwd = cwd;
			}
			cp.execFileSync('taskkill', ['/T', '/F', '/PID', process.pid.toString()], options);
		} catch (err) {
			return { success: false, error: err, code: err.status ? getWindowsCode(err.status) : TerminateResponseCode.Unknown };
		}
	} else if (Platform.isLinux || Platform.isMacintosh) {
		try {
			let cmd = URI.parse(require.toUrl('vs/base/node/terminateProcess.sh')).fsPath;
			let result = cp.spawnSync(cmd, [process.pid.toString()]);
			if (result.error) {
				return { success: false, error: result.error };
			}
		} catch (err) {
			return { success: false, error: err };
		}
	} else {
		process.kill('SIGKILL');
	}
	return { success: true };
}

export function getWindowsShell(): string {
	return process.env['comspec'] || 'cmd.exe';
}

export abstract class AbstractProcess<TProgressData> {
	private cmd: string;
	private module: string;
	private args: string[];
	private options: CommandOptions | ForkOptions;
	protected shell: boolean;

	private childProcess: ChildProcess;
	protected childProcessPromise: TPromise<ChildProcess>;
	protected terminateRequested: boolean;

	private static WellKnowCommands: IStringDictionary<boolean> = {
		'ant': true,
		'cmake': true,
		'eslint': true,
		'gradle': true,
		'grunt': true,
		'gulp': true,
		'jake': true,
		'jenkins': true,
		'jshint': true,
		'make': true,
		'maven': true,
		'msbuild': true,
		'msc': true,
		'nmake': true,
		'npm': true,
		'rake': true,
		'tsc': true,
		'xbuild': true
	};

	public constructor(executable: Executable);
	public constructor(cmd: string, args: string[], shell: boolean, options: CommandOptions);
	public constructor(module: string, args: string[], options: ForkOptions);
	public constructor(arg1: string | Executable, arg2?: string[], arg3?: boolean | ForkOptions, arg4?: CommandOptions) {
		if (arg4) {
			this.cmd = <string>arg1;
			this.args = arg2;
			this.shell = <boolean>arg3;
			this.options = arg4;
		} else if (arg3 && arg2) {
			this.module = <string>arg1;
			this.args = arg2;
			this.shell = false;
			this.options = <ForkOptions>arg3;
		} else {
			let executable = <Executable>arg1;
			this.cmd = executable.command;
			this.shell = executable.isShellCommand;
			this.args = executable.args.slice(0);
			this.options = executable.options || {};
		}

		this.childProcess = null;
		this.terminateRequested = false;

		if (this.options.env) {
			let newEnv: IStringDictionary<string> = Object.create(null);
			Object.keys(process.env).forEach((key) => {
				newEnv[key] = process.env[key];
			});
			Object.keys(this.options.env).forEach((key) => {
				newEnv[key] = this.options.env[key];
			});
			this.options.env = newEnv;
		}
	}

	public getSanitizedCommand(): string {
		let result = this.cmd.toLowerCase();
		let index = result.lastIndexOf(path.sep);
		if (index !== -1) {
			result = result.substring(index + 1);
		}
		if (AbstractProcess.WellKnowCommands[result]) {
			return result;
		}
		return 'other';
	}

	public start(): PPromise<SuccessData, TProgressData> {
		if (Platform.isWindows && ((this.options && this.options.cwd && TPath.isUNC(this.options.cwd)) || !this.options && !this.options.cwd && TPath.isUNC(process.cwd()))) {
			return Promise.wrapError(nls.localize('TaskRunner.UNC', 'Can\'t execute a shell command on an UNC drive.'));
		}
		return this.useExec().then((useExec) => {
			let cc: TValueCallback<SuccessData>;
			let ee: ErrorCallback;
			let pp: TProgressCallback<TProgressData>;
			let result = new PPromise<any, TProgressData>((c, e, p) => {
				cc = c;
				ee = e;
				pp = p;
			});

			if (useExec) {
				let cmd: string = this.cmd;
				if (this.args) {
					cmd = cmd + ' ' + this.args.join(' ');
				}
				this.childProcess = exec(cmd, this.options, (error, stdout, stderr) => {
					this.childProcess = null;
					let err: any = error;
					// This is tricky since executing a command shell reports error back in case the executed command return an
					// error or the command didn't exist at all. So we can't blindly treat an error as a failed command. So we
					// always parse the output and report success unless the job got killed.
					if (err && err.killed) {
						ee({ killed: this.terminateRequested, stdout: stdout.toString(), stderr: stderr.toString() });
					} else {
						this.handleExec(cc, pp, error, stdout as any, stderr as any);
					}
				});
			} else {
				let childProcess: ChildProcess = null;
				let closeHandler = (data: any) => {
					this.childProcess = null;
					this.childProcessPromise = null;
					this.handleClose(data, cc, pp, ee);
					let result: SuccessData = {
						terminated: this.terminateRequested
					};
					if (Types.isNumber(data)) {
						result.cmdCode = <number>data;
					}
					cc(result);
				};
				if (this.shell && Platform.isWindows) {
					let options: any = Objects.clone(this.options);
					options.windowsVerbatimArguments = true;
					options.detached = false;
					let quotedCommand: boolean = false;
					let quotedArg: boolean = false;
					let commandLine: string[] = [];
					let quoted = this.ensureQuotes(this.cmd);
					commandLine.push(quoted.value);
					quotedCommand = quoted.quoted;
					if (this.args) {
						this.args.forEach((elem) => {
							quoted = this.ensureQuotes(elem);
							commandLine.push(quoted.value);
							quotedArg = quotedArg && quoted.quoted;
						});
					}
					let args: string[] = [
						'/s',
						'/c',
					];
					if (quotedCommand) {
						if (quotedArg) {
							args.push('"' + commandLine.join(' ') + '"');
						} else if (commandLine.length > 1) {
							args.push('"' + commandLine[0] + '"' + ' ' + commandLine.slice(1).join(' '));
						} else {
							args.push('"' + commandLine[0] + '"');
						}
					} else {
						args.push(commandLine.join(' '));
					}
					childProcess = spawn(getWindowsShell(), args, options);
				} else {
					if (this.cmd) {
						childProcess = spawn(this.cmd, this.args, this.options);
					} else if (this.module) {
						this.childProcessPromise = new TPromise<ChildProcess>((c, e, p) => {
							fork(this.module, this.args, <ForkOptions>this.options, (error: any, childProcess: ChildProcess) => {
								if (error) {
									e(error);
									ee({ terminated: this.terminateRequested, error: error });
									return;
								}
								this.childProcess = childProcess;
								this.childProcess.on('close', closeHandler);
								this.handleSpawn(childProcess, cc, pp, ee, false);
								c(childProcess);
							});
						});
					}
				}
				if (childProcess) {
					this.childProcess = childProcess;
					this.childProcessPromise = TPromise.as(childProcess);
					childProcess.on('error', (error: Error) => {
						this.childProcess = null;
						ee({ terminated: this.terminateRequested, error: error });
					});
					if (childProcess.pid) {
						this.childProcess.on('close', closeHandler);
						this.handleSpawn(childProcess, cc, pp, ee, true);
					}
				}
			}
			return result;
		});
	}

	protected abstract handleExec(cc: TValueCallback<SuccessData>, pp: TProgressCallback<TProgressData>, error: Error, stdout: Buffer, stderr: Buffer): void;
	protected abstract handleSpawn(childProcess: ChildProcess, cc: TValueCallback<SuccessData>, pp: TProgressCallback<TProgressData>, ee: ErrorCallback, sync: boolean): void;

	protected handleClose(data: any, cc: TValueCallback<SuccessData>, pp: TProgressCallback<TProgressData>, ee: ErrorCallback): void {
		// Default is to do nothing.
	}

	private static regexp = /^[^"].* .*[^"]/;
	private ensureQuotes(value: string) {
		if (AbstractProcess.regexp.test(value)) {
			return {
				value: '"' + value + '"', //`"${value}"`,
				quoted: true
			};
		} else {
			return {
				value: value,
				quoted: value.length > 0 && value[0] === '"' && value[value.length - 1] === '"'
			};
		}
	}

	public isRunning(): boolean {
		return this.childProcessPromise !== null;
	}

	public get pid(): TPromise<number> {
		return this.childProcessPromise.then(childProcess => childProcess.pid, err => -1);
	}

	public terminate(): TPromise<TerminateResponse> {
		if (!this.childProcessPromise) {
			return TPromise.as<TerminateResponse>({ success: true });
		}
		return this.childProcessPromise.then((childProcess) => {
			this.terminateRequested = true;
			let result = terminateProcess(childProcess, this.options.cwd);
			if (result.success) {
				this.childProcess = null;
			}
			return result;
		}, (err) => {
			return { success: true };
		});
	}

	private useExec(): TPromise<boolean> {
		return new TPromise<boolean>((c, e, p) => {
			if (!this.shell || !Platform.isWindows) {
				c(false);
			}
			let cmdShell = spawn(getWindowsShell(), ['/s', '/c']);
			cmdShell.on('error', (error: Error) => {
				c(true);
			});
			cmdShell.on('exit', (data: any) => {
				c(false);
			});
		});
	}
}

export class LineProcess extends AbstractProcess<LineData> {

	private stdoutLineDecoder: LineDecoder;
	private stderrLineDecoder: LineDecoder;

	public constructor(executable: Executable);
	public constructor(cmd: string, args: string[], shell: boolean, options: CommandOptions);
	public constructor(module: string, args: string[], options: ForkOptions);
	public constructor(arg1: string | Executable, arg2?: string[], arg3?: boolean | ForkOptions, arg4?: CommandOptions) {
		super(<any>arg1, arg2, <any>arg3, arg4);
	}

	protected handleExec(cc: TValueCallback<SuccessData>, pp: TProgressCallback<LineData>, error: Error, stdout: Buffer, stderr: Buffer) {
		[stdout, stderr].forEach((buffer: Buffer, index: number) => {
			let lineDecoder = new LineDecoder();
			let lines = lineDecoder.write(buffer);
			lines.forEach((line) => {
				pp({ line: line, source: index === 0 ? Source.stdout : Source.stderr });
			});
			let line = lineDecoder.end();
			if (line) {
				pp({ line: line, source: index === 0 ? Source.stdout : Source.stderr });
			}
		});
		cc({ terminated: this.terminateRequested, error: error });
	}

	protected handleSpawn(childProcess: ChildProcess, cc: TValueCallback<SuccessData>, pp: TProgressCallback<LineData>, ee: ErrorCallback, sync: boolean): void {
		this.stdoutLineDecoder = new LineDecoder();
		this.stderrLineDecoder = new LineDecoder();
		childProcess.stdout.on('data', (data: Buffer) => {
			let lines = this.stdoutLineDecoder.write(data);
			lines.forEach(line => pp({ line: line, source: Source.stdout }));
		});
		childProcess.stderr.on('data', (data: Buffer) => {
			let lines = this.stderrLineDecoder.write(data);
			lines.forEach(line => pp({ line: line, source: Source.stderr }));
		});
	}

	protected handleClose(data: any, cc: TValueCallback<SuccessData>, pp: TProgressCallback<LineData>, ee: ErrorCallback): void {
		[this.stdoutLineDecoder.end(), this.stderrLineDecoder.end()].forEach((line, index) => {
			if (line) {
				pp({ line: line, source: index === 0 ? Source.stdout : Source.stderr });
			}
		});
	}
}

export class BufferProcess extends AbstractProcess<BufferData> {

	public constructor(executable: Executable);
	public constructor(cmd: string, args: string[], shell: boolean, options: CommandOptions);
	public constructor(module: string, args: string[], options: ForkOptions);
	public constructor(arg1: string | Executable, arg2?: string[], arg3?: boolean | ForkOptions, arg4?: CommandOptions) {
		super(<any>arg1, arg2, <any>arg3, arg4);
	}

	protected handleExec(cc: TValueCallback<SuccessData>, pp: TProgressCallback<BufferData>, error: Error, stdout: Buffer, stderr: Buffer): void {
		pp({ data: stdout, source: Source.stdout });
		pp({ data: stderr, source: Source.stderr });
		cc({ terminated: this.terminateRequested, error: error });
	}

	protected handleSpawn(childProcess: ChildProcess, cc: TValueCallback<SuccessData>, pp: TProgressCallback<BufferData>, ee: ErrorCallback, sync: boolean): void {
		childProcess.stdout.on('data', (data: Buffer) => {
			pp({ data: data, source: Source.stdout });
		});
		childProcess.stderr.on('data', (data: Buffer) => {
			pp({ data: data, source: Source.stderr });
		});
	}
}

export class StreamProcess extends AbstractProcess<StreamData> {

	public constructor(executable: Executable);
	public constructor(cmd: string, args: string[], shell: boolean, options: CommandOptions);
	public constructor(module: string, args: string[], options: ForkOptions);
	public constructor(arg1: string | Executable, arg2?: string[], arg3?: boolean | ForkOptions, arg4?: CommandOptions) {
		super(<any>arg1, arg2, <any>arg3, arg4);
	}

	protected handleExec(cc: TValueCallback<SuccessData>, pp: TProgressCallback<StreamData>, error: Error, stdout: Buffer, stderr: Buffer): void {
		let stdoutStream = new PassThrough();
		stdoutStream.end(stdout);
		let stderrStream = new PassThrough();
		stderrStream.end(stderr);
		pp({ stdin: null, stdout: stdoutStream, stderr: stderrStream });
		cc({ terminated: this.terminateRequested, error: error });
	}

	protected handleSpawn(childProcess: ChildProcess, cc: TValueCallback<SuccessData>, pp: TProgressCallback<StreamData>, ee: ErrorCallback, sync: boolean): void {
		if (sync) {
			process.nextTick(() => {
				pp({ stdin: childProcess.stdin, stdout: childProcess.stdout, stderr: childProcess.stderr });
			});
		} else {
			pp({ stdin: childProcess.stdin, stdout: childProcess.stdout, stderr: childProcess.stderr });
		}
	}
}

export interface IQueuedSender {
	send: (msg: any) => void;
}

// Wrapper around process.send() that will queue any messages if the internal node.js
// queue is filled with messages and only continue sending messages when the internal
// queue is free again to consume messages.
// On Windows we always wait for the send() method to return before sending the next message
// to workaround https://github.com/nodejs/node/issues/7657 (IPC can freeze process)
export function createQueuedSender(childProcess: ChildProcess | NodeJS.Process): IQueuedSender {
	let msgQueue = [];
	let useQueue = false;

	const send = function (msg: any): void {
		if (useQueue) {
			msgQueue.push(msg); // add to the queue if the process cannot handle more messages
			return;
		}

		let result = childProcess.send(msg, error => {
			if (error) {
				console.error(error); // unlikely to happen, best we can do is log this error
			}

			useQueue = false; // we are good again to send directly without queue

			// now send all the messages that we have in our queue and did not send yet
			if (msgQueue.length > 0) {
				const msgQueueCopy = msgQueue.slice(0);
				msgQueue = [];
				msgQueueCopy.forEach(entry => send(entry));
			}
		});

		if (!result || Platform.isWindows /* workaround https://github.com/nodejs/node/issues/7657 */) {
			useQueue = true;
		}
	};

	return { send };
}