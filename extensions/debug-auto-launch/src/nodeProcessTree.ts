/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { getProcessTree, ProcessTreeNode } from './processTree';
import { analyseArguments } from './protocolDetection';

const pids = new Set<number>();

const POLL_INTERVAL = 1000;

/**
 * Poll for all subprocesses of given root process.
 */
export function pollProcesses(rootPid: number, inTerminal: boolean, cb: (pid: number, cmd: string, args: string) => void): vscode.Disposable {

	let stopped = false;

	function poll() {
		//const start = Date.now();
		findChildProcesses(rootPid, inTerminal, cb).then(_ => {
			//console.log(`duration: ${Date.now() - start}`);
			setTimeout(_ => {
				if (!stopped) {
					poll();
				}
			}, POLL_INTERVAL);
		});
	}

	poll();

	return new vscode.Disposable(() => stopped = true);
}

export function attachToProcess(folder: vscode.WorkspaceFolder | undefined, name: string, pid: number, args: string, baseConfig?: vscode.DebugConfiguration) {

	if (pids.has(pid)) {
		return;
	}
	pids.add(pid);

	const config: vscode.DebugConfiguration = {
		type: 'node',
		request: 'attach',
		name: name,
		stopOnEntry: false
	};

	if (baseConfig) {
		// selectively copy attributes
		if (baseConfig.timeout) {
			config.timeout = baseConfig.timeout;
		}
		if (baseConfig.sourceMaps) {
			config.sourceMaps = baseConfig.sourceMaps;
		}
		if (baseConfig.outFiles) {
			config.outFiles = baseConfig.outFiles;
		}
		if (baseConfig.sourceMapPathOverrides) {
			config.sourceMapPathOverrides = baseConfig.sourceMapPathOverrides;
		}
		if (baseConfig.smartStep) {
			config.smartStep = baseConfig.smartStep;
		}
		if (baseConfig.skipFiles) {
			config.skipFiles = baseConfig.skipFiles;
		}
		if (baseConfig.showAsyncStacks) {
			config.sourceMaps = baseConfig.showAsyncStacks;
		}
		if (baseConfig.trace) {
			config.trace = baseConfig.trace;
		}
	}

	let { usePort, protocol, port } = analyseArguments(args);
	if (usePort) {
		config.processId = `${protocol}${port}`;
	} else {
		if (protocol && port > 0) {
			config.processId = `${pid}${protocol}${port}`;
		} else {
			config.processId = pid.toString();
		}
	}

	vscode.debug.startDebugging(folder, config);
}

function findChildProcesses(rootPid: number, inTerminal: boolean, cb: (pid: number, cmd: string, args: string) => void): Promise<void> {

	function walker(node: ProcessTreeNode, terminal: boolean, renderer: number) {

		if ((node.args.indexOf('--type=terminal') >= 0 || node.command.indexOf('\\winpty-agent.exe') >= 0) && (renderer === 0 || node.ppid === renderer)) {
			terminal = true;
		}

		let { protocol } = analyseArguments(node.args);
		if (terminal && protocol) {
			cb(node.pid, node.command, node.args);
		}

		for (const child of node.children || []) {
			walker(child, terminal, renderer);
		}
	}

	function finder(node: ProcessTreeNode, pid: number): ProcessTreeNode | undefined {
		if (node.pid === pid) {
			return node;
		}
		for (const child of node.children || []) {
			const p = finder(child, pid);
			if (p) {
				return p;
			}
		}
		return undefined;
	}

	return getProcessTree(rootPid).then(tree => {
		if (tree) {

			// find the pid of the renderer process
			const extensionHost = finder(tree, process.pid);
			let rendererPid = extensionHost ? extensionHost.ppid : 0;

			for (const child of tree.children || []) {
				walker(child, !inTerminal, rendererPid);
			}
		}
	});
}
