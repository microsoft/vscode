/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Emitter } from 'vs/base/common/event';

enum ControlMessage {
	okToChild = 'ok>',
	okFromChild = 'ok<',
}

interface RelaunchMessage {
	type: 'relaunch';
	version: string;
}

export type Message = RelaunchMessage;

class IpcMain {
	protected readonly _onMessage = new Emitter<Message>();
	public readonly onMessage = this._onMessage.event;

	public handshake(child?: cp.ChildProcess): Promise<void> {
		return new Promise((resolve, reject) => {
			const target = child || process;
			if (!target.send) {
				throw new Error('Not spawned with IPC enabled');
			}
			target.on('message', (message) => {
				if (message === child ? ControlMessage.okFromChild : ControlMessage.okToChild) {
					target.removeAllListeners();
					target.on('message', (msg) => this._onMessage.fire(msg));
					if (child) {
						target.send!(ControlMessage.okToChild);
					}
					resolve();
				}
			});
			if (child) {
				child.once('error', reject);
				child.once('exit', (code) => {
					const error = new Error(`Unexpected exit with code ${code}`);
					(error as any).code = code;
					reject(error);
				});
			} else {
				target.send(ControlMessage.okFromChild);
			}
		});
	}

	public relaunch(version: string): void {
		this.send({ type: 'relaunch', version });
	}

	private send(message: Message): void {
		if (!process.send) {
			throw new Error('Not a child process with IPC enabled');
		}
		process.send(message);
	}
}

export const ipcMain = new IpcMain();
