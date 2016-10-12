/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as denodeify from 'denodeify';
import { IDisposable, toDisposable, dispose } from './util';
import * as _ from 'lodash';

const readdir = denodeify(fs.readdir);

export interface IGit {
	path: string;
	version: string;
}

function parseVersion(raw: string): string {
	return raw.replace(/^git version /, '');
}

function findSpecificGit(path: string): Promise<IGit> {
	return new Promise<IGit>((c, e) => {
		const buffers: Buffer[] = [];
		const child = cp.spawn(path, ['--version']);
		child.stdout.on('data', b => buffers.push(b));
		child.on('error', e);
		child.on('exit', code => code ? e(new Error('Not found')) : c({ path, version: parseVersion(Buffer.concat(buffers).toString('utf8').trim()) }));
	});
}

function findGitDarwin(): Promise<IGit> {
	return new Promise<IGit>((c, e) => {
		cp.exec('which git', (err, gitPathBuffer) => {
			if (err) {
				return e('git not found');
			}

			const path = gitPathBuffer.toString().replace(/^\s+|\s+$/g, '');

			function getVersion(path: string) {
				// make sure git executes
				cp.exec('git --version', (err, stdout) => {
					if (err) {
						return e('git not found');
					}

					return c({ path, version: parseVersion(stdout.toString('utf8').trim()) });
				});
			}

			if (path !== '/usr/bin/git') {
				return getVersion(path);
			}

			// must check if XCode is installed
			cp.exec('xcode-select -p', (err: any) => {
				if (err && err.code === 2) {
					// git is not installed, and launching /usr/bin/git
					// will prompt the user to install it

					return e('git not found');
				}

				getVersion(path);
			});
		});
	});
}

function findSystemGitWin32(base: string): Promise<IGit> {
	if (!base) {
		return Promise.reject<IGit>('Not found');
	}

	return findSpecificGit(path.join(base, 'Git', 'cmd', 'git.exe'));
}

function findGitHubGitWin32(): Promise<IGit> {
	const github = path.join(process.env['LOCALAPPDATA'], 'GitHub');

	return readdir(github).then(children => {
		const git = children.filter(child => /^PortableGit/.test(child))[0];

		if (!git) {
			return Promise.reject<IGit>('Not found');
		}

		return findSpecificGit(path.join(github, git, 'cmd', 'git.exe'));
	});
}

function findGitWin32(): Promise<IGit> {
	return findSystemGitWin32(process.env['ProgramW6432'])
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles(x86)']))
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles']))
		.then(null, () => findSpecificGit('git'))
		.then(null, () => findGitHubGitWin32());
}

export function findGit(hint: string): Promise<IGit> {
	var first = hint ? findSpecificGit(hint) : Promise.reject<IGit>(null);

	return first.then(null, () => {
		switch (process.platform) {
			case 'darwin': return findGitDarwin();
			case 'win32': return findGitWin32();
			default: return findSpecificGit('git');
		}
	});

}


export interface IExecutionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

// TODO
function decode(buffer, encoding) {
	return buffer.toString('utf8');
}

export function exec(child: cp.ChildProcess, encoding = 'utf8'): Promise<IExecutionResult> {
	const disposables: IDisposable[] = [];

	const once = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
		ee.once(name, fn);
		disposables.push(toDisposable(() => ee.removeListener(name, fn)));
	};

	const on = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
		ee.on(name, fn);
		disposables.push(toDisposable(() => ee.removeListener(name, fn)));
	};

	return Promise.all<any>([
		new Promise<number>((c, e) => {
			once(child, 'error', e);
			once(child, 'exit', c);
		}),
		new Promise<string>(c => {
			let buffers: Buffer[] = [];
			on(child.stdout, 'data', b => buffers.push(b));
			once(child.stdout, 'close', () => c(decode(Buffer.concat(buffers), encoding)));
		}),
		new Promise<string>(c => {
			let buffers: Buffer[] = [];
			on(child.stderr, 'data', b => buffers.push(b));
			once(child.stderr, 'close', () => c(decode(Buffer.concat(buffers), encoding)));
		})
	]).then(values => {
		dispose(disposables);

		return {
			exitCode: values[0],
			stdout: values[1],
			stderr: values[2]
		};
	});
}

export interface IGitErrorData {
	error?: Error;
	message?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	gitErrorCode?: string;
	gitCommand?: string;
}

export class GitError {

	error: Error;
	message: string;
	stdout: string;
	stderr: string;
	exitCode: number;
	gitErrorCode: string;
	gitCommand: string;

	constructor(data: IGitErrorData) {
		if (data.error) {
			this.error = data.error;
			this.message = data.error.message;
		} else {
			this.error = null;
		}

		this.message = this.message || data.message || 'Git error';
		this.stdout = data.stdout || null;
		this.stderr = data.stderr || null;
		this.exitCode = data.exitCode || null;
		this.gitErrorCode = data.gitErrorCode || null;
		this.gitCommand = data.gitCommand || null;
	}

	toString(): string {
		let result = this.message + ' ' + JSON.stringify({
			exitCode: this.exitCode,
			gitErrorCode: this.gitErrorCode,
			gitCommand: this.gitCommand,
			stdout: this.stdout,
			stderr: this.stderr
		}, null, 2);

		if (this.error) {
			result += (<any>this.error).stack;
		}

		return result;
	}
}

export interface IGitOptions {
	gitPath: string;
	version: string;
	defaultEncoding?: string;
	env?: any;
}

export const GitErrorCodes = {
	BadConfigFile: 'BadConfigFile',
	AuthenticationFailed: 'AuthenticationFailed',
	NoUserNameConfigured: 'NoUserNameConfigured',
	NoUserEmailConfigured: 'NoUserEmailConfigured',
	NoRemoteRepositorySpecified: 'NoRemoteRepositorySpecified',
	NotAGitRepository: 'NotAGitRepository',
	NotAtRepositoryRoot: 'NotAtRepositoryRoot',
	Conflict: 'Conflict',
	UnmergedChanges: 'UnmergedChanges',
	PushRejected: 'PushRejected',
	RemoteConnectionError: 'RemoteConnectionError',
	DirtyWorkTree: 'DirtyWorkTree',
	CantOpenResource: 'CantOpenResource',
	GitNotFound: 'GitNotFound',
	CantCreatePipe: 'CantCreatePipe',
	CantAccessRemote: 'CantAccessRemote',
	RepositoryNotFound: 'RepositoryNotFound'
};

// TODO
function encodingExists(encoding) {
	return true;
}

export class Git {

	gitPath: string;
	version: string;
	env: any;
	private defaultEncoding: string;
	private outputListeners: { (output: string): void; }[];

	constructor(options: IGitOptions) {
		this.gitPath = options.gitPath;
		this.version = options.version;

		const encoding = options.defaultEncoding || 'utf8';
		this.defaultEncoding = encodingExists(encoding) ? encoding : 'utf8';

		this.env = options.env || {};
		this.outputListeners = [];
	}

	exec(cwd: string, args: string[], options: any = {}): Promise<IExecutionResult> {
		options = _.assign({ cwd: cwd }, options || {});
		return this._exec(args, options);
	}

	stream(cwd: string, args: string[], options: any = {}): cp.ChildProcess {
		options = _.assign({ cwd: cwd }, options || {});
		return this.spawn(args, options);
	}

	private _exec(args: string[], options: any = {}): Promise<IExecutionResult> {
		const child = this.spawn(args, options);

		if (options.input) {
			child.stdin.end(options.input, 'utf8');
		}

		return exec(child).then(result => {
			if (result.exitCode) {
				let gitErrorCode: string = null;

				if (/Authentication failed/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.AuthenticationFailed;
				} else if (/Not a git repository/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.NotAGitRepository;
				} else if (/bad config file/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.BadConfigFile;
				} else if (/cannot make pipe for command substitution|cannot create standard input pipe/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.CantCreatePipe;
				} else if (/Repository not found/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.RepositoryNotFound;
				} else if (/unable to access/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.CantAccessRemote;
				}

				return Promise.reject<IExecutionResult>(new GitError({
					message: 'Failed to execute git',
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					gitErrorCode,
					gitCommand: args[0]
				}));
			}

			return result;
		});
	}

	spawn(args: string[], options: any = {}): cp.ChildProcess {
		if (!this.gitPath) {
			throw new Error('git could not be found in the system.');
		}

		if (!options) {
			options = {};
		}

		if (!options.stdio && !options.input) {
			options.stdio = ['ignore', null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
		}

		options.env = _.assign({}, options.env || {}, this.env);

		if (options.log !== false) {
			this.log(`git ${args.join(' ')}\n`);
		}

		return cp.spawn(this.gitPath, args, options);
	}

	onOutput(listener: (output: string) => void): () => void {
		this.outputListeners.push(listener);
		return () => this.outputListeners.splice(this.outputListeners.indexOf(listener), 1);
	}

	private log(output: string): void {
		this.outputListeners.forEach(l => l(output));
	}
}