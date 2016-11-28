/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import cp = require('child_process');

import { FileChangeType } from 'vs/platform/files/common/files';
import decoder = require('vs/base/node/decoder');
import glob = require('vs/base/common/glob');
import uri from 'vs/base/common/uri';

import { IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';

export class OutOfProcessWin32FolderWatcher {

	private static MAX_RESTARTS = 5;

	private static changeTypeMap: FileChangeType[] = [FileChangeType.UPDATED, FileChangeType.ADDED, FileChangeType.DELETED];

	private handle: cp.ChildProcess;
	private restartCounter: number;

	constructor(
		private watchedFolder: string,
		private ignored: string[],
		private eventCallback: (events: IRawFileChange[]) => void,
		private errorCallback: (error: string) => void,
		private verboseLogging: boolean
	) {
		this.restartCounter = 0;

		this.startWatcher();
	}

	private startWatcher(): void {
		const args = [this.watchedFolder];
		if (this.verboseLogging) {
			args.push('-verbose');
		}

		this.handle = cp.spawn(uri.parse(require.toUrl('vs/workbench/services/files/node/watcher/win32/CodeHelper.exe')).fsPath, args);

		const stdoutLineDecoder = new decoder.LineDecoder();

		// Events over stdout
		this.handle.stdout.on('data', (data: NodeBuffer) => {

			// Collect raw events from output
			const rawEvents: IRawFileChange[] = [];
			stdoutLineDecoder.write(data).forEach((line) => {
				const eventParts = line.split('|');
				if (eventParts.length === 2) {
					const changeType = Number(eventParts[0]);
					const absolutePath = eventParts[1];

					// File Change Event (0 Changed, 1 Created, 2 Deleted)
					if (changeType >= 0 && changeType < 3) {

						// Support ignores
						if (this.ignored && this.ignored.some(ignore => glob.match(ignore, absolutePath))) {
							return;
						}

						// Otherwise record as event
						rawEvents.push({
							type: OutOfProcessWin32FolderWatcher.changeTypeMap[changeType],
							path: absolutePath
						});
					}

					// 3 Logging
					else {
						console.log('%c[File Watcher]', 'color: darkgreen', eventParts[1]);
					}
				}
			});

			// Trigger processing of events through the delayer to batch them up properly
			if (rawEvents.length > 0) {
				this.eventCallback(rawEvents);
			}
		});

		// Errors
		this.handle.on('error', (error: Error) => this.onError(error));
		this.handle.stderr.on('data', (data: NodeBuffer) => this.onError(data));

		// Exit
		this.handle.on('exit', (code: any, signal: any) => this.onExit(code, signal));
	}

	private onError(error: Error | NodeBuffer): void {
		this.errorCallback('[FileWatcher] process error: ' + error.toString());
	}

	private onExit(code: any, signal: any): void {
		if (this.handle) { // exit while not yet being disposed is unexpected!
			this.errorCallback(`[FileWatcher] terminated unexpectedly (code: ${code}, signal: ${signal})`);

			if (this.restartCounter <= OutOfProcessWin32FolderWatcher.MAX_RESTARTS) {
				this.errorCallback('[FileWatcher] is restarted again...');
				this.restartCounter++;
				this.startWatcher(); // restart
			} else {
				this.errorCallback('[FileWatcher] Watcher failed to start after retrying for some time, giving up. Please report this as a bug report!');
			}
		}
	}

	public dispose(): void {
		if (this.handle) {
			this.handle.kill();
			this.handle = null;
		}
	}
}