/* eslint-disable code-import-patterns */
/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

const devMode = !!process.env['VSCODE_DEV'];
const supervisorAddr = process.env.SUPERVISOR_ADDR || 'localhost:22999';

let activeCliIpcHook: string | undefined;
const didChangeActiveCliIpcHookEmitter = new Emitter<void>();

function withActiveCliIpcHook(cb: (activeCliIpcHook: string) => void): IDisposable {
	if (activeCliIpcHook) {
		cb(activeCliIpcHook);
		return { dispose: () => { } };
	}
	const listener = didChangeActiveCliIpcHookEmitter.event(() => {
		if (activeCliIpcHook) {
			listener.dispose();
			cb(activeCliIpcHook);
		}
	});
	return listener;
}

function deleteActiveCliIpcHook(cliIpcHook: string) {
	if (!activeCliIpcHook || activeCliIpcHook !== cliIpcHook) {
		return;
	}
	activeCliIpcHook = undefined;
	didChangeActiveCliIpcHookEmitter.fire();
}

function setActiveCliIpcHook(cliIpcHook: string): void {
	if (activeCliIpcHook === cliIpcHook) {
		return;
	}
	activeCliIpcHook = cliIpcHook;
	didChangeActiveCliIpcHookEmitter.fire();
}

export function handleGitpodCLIRequest(pathname: string, req: http.IncomingMessage, res: http.ServerResponse) {
	if (pathname.startsWith('/cli')) {
		if (req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(activeCliIpcHook);
			return true;
		}
		if (req.method === 'DELETE') {
			const cliIpcHook = decodeURIComponent(pathname.substring('/cli/ipcHookCli/'.length));
			deleteActiveCliIpcHook(cliIpcHook);
			res.writeHead(200);
			res.end();
			return true;
		}
		if (req.method === 'PUT') {
			const cliIpcHook = decodeURIComponent(pathname.substring('/cli/ipcHookCli/'.length));
			setActiveCliIpcHook(cliIpcHook);
			res.writeHead(200);
			res.end();
			return true;
		}
		if (req.method === 'POST') {
			const listener = withActiveCliIpcHook(activeCliIpcHook =>
				req.pipe(http.request({
					socketPath: activeCliIpcHook,
					method: req.method,
					headers: req.headers
				}, res2 => {
					res.setHeader('Content-Type', 'application/json');
					res2.pipe(res);
				}))
			);
			req.on('close', () => listener.dispose());
			return true;
		}
		return false;
	}
	if (devMode && pathname.startsWith('/_supervisor')) {
		const [host, port] = supervisorAddr.split(':');
		req.pipe(http.request({
			host,
			port,
			method: req.method,
			path: pathname
		}, res2 => res2.pipe(res)));
		return true;
	}
	return false;
}
