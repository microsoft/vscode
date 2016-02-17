/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import hash = require('vs/base/common/hash');
import collections = require('vs/base/common/collections');
import {TPromise} from 'vs/base/common/winjs.base';
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import exec = require('vs/workbench/parts/execution/common/execution');
import uri from 'vs/base/common/uri';

import cp = require('child_process');
import processes = require('vs/base/node/processes');

export class AbstractExecutionService implements exec.IExecutionService {
	public serviceId = exec.IExecutionService;
	private _executions: collections.INumberDictionary<TPromise<any>> = Object.create(null);

	public exec(file: string, args: string[], cwdOrOptions: string | exec.IOptions): TPromise<any> {

		let options: exec.IOptions,
			allEnv = objects.clone(process.env);

		if (typeof cwdOrOptions === 'string') {
			options = {
				cwd: cwdOrOptions,
				env: allEnv
			};
		} else {
			objects.mixin(allEnv, cwdOrOptions.env);
			cwdOrOptions.env = allEnv;
			options = cwdOrOptions;
		}

		let key = args.concat([file, options.cwd]).reduce((p, c) => hash.combine(hash.computeMurmur2StringHashCode(c), p), 17);
		if (this._executions[key]) {
			this._executions[key].cancel();
			delete this._executions[key];
		}

		let ret = this.doExec(file, args, options);

		this._executions[key] = ret;

		return ret.then(val => val, err => {
			if (!errors.isPromiseCanceledError(err)) {
				throw err;
			}
		});
	}

	protected doExec(file: string, args: string[], options: exec.IOptions): TPromise<any> {
		throw errors.notImplemented();
	}
}

export class WinExecutionService extends AbstractExecutionService {

	protected doExec(file: string, args: string[], options: exec.IOptions): TPromise<any> {

		let childProcess: cp.ChildProcess;

		return new TPromise<any>((c, e, p) => {

			const shell = processes.getWindowsShell();

			// we use `start` to get another shell where `& pause` can be handled
			args = [
				'/c',
				'start',
				'/wait',
				shell,
				'/c',
				strings.format('"{0} {1} & pause"', file, args.join(' '))
			];

			options = options || <any>{};
			(<any>options).windowsVerbatimArguments = true;

			childProcess = cp.spawn(shell, args, options);

			childProcess.on('exit', c);
			childProcess.on('error', e);

			// send out the process once
			p(childProcess);

		}, function() {
			if (!childProcess) {
				return;
			}
			cp.exec(`taskkill /F /T /PID ${childProcess.pid}`, function(err, stdout, stderr) {
				if (err) {
					console.error(err);
				}
			});
		});
	}
}

export class MacExecutionService extends AbstractExecutionService {

	protected doExec(file: string, args: string[], options: exec.IOptions): TPromise<any> {
		let childProcess: cp.ChildProcess;

		return new TPromise<any>((c, e, p) => {

			args = [
				uri.parse(require.toUrl('vs/workbench/parts/execution/electron-browser/macHelper.scpt')).fsPath,
				'cd', `'${options.cwd}'`, ';',
				file
			].concat(args);

			childProcess = cp.spawn('/usr/bin/osascript', args, options);

			childProcess.on('exit', c);
			childProcess.on('error', e);

			// send out the process once
			p(childProcess);

		}, function() {
			if (childProcess) {
				childProcess.kill('SIGTERM');
			}
		});
	}
}

export class LinuxExecutionService extends AbstractExecutionService {

	private static LINUX_TERM = '/usr/bin/gnome-terminal'; // '/usr/bin/x-terminal-emulator'
	private static WAIT_MESSAGE = nls.localize('linux.wait', "Press any key to continue...");

	protected doExec(file: string, args: string[], options: exec.IOptions): TPromise<any> {
		let childProcess: cp.ChildProcess;

		return new TPromise<any>((c, e, p) => {

			let flattenedArgs = '';
			if (args.length > 0) {
				flattenedArgs = '"' + args.join('" "') + '"';
			}

			let cdCommand = '';
			if (options.cwd) {
				cdCommand = strings.format('cd "{0}"', options.cwd);
			}

			let bashCommand = strings.format(
				'{0}; "{1}" {2} ; echo; read -p "{3}" -n1;',
				cdCommand, file, flattenedArgs, LinuxExecutionService.WAIT_MESSAGE
			);

			args = [
				'-x',
				'bash',
				'-c',
				// wrapping argument in two sets of ' because node is so "friendly" that it removes one set...
				strings.format('\'\'{0}\'\'', bashCommand)
			];

			childProcess = cp.spawn(LinuxExecutionService.LINUX_TERM, args, options);

			childProcess.on('exit', c);
			childProcess.on('error', e);

			// send out the process once
			p(childProcess);

		}, function() {
			console.log('SENDING KILL');
			if (childProcess) {
				childProcess.kill('SIGTERM');
			}
		});
	}

}