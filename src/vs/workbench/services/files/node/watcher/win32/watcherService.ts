/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IRawFileChange, toFileChangesEvent } from 'vs/workbench/services/files/node/watcher/common';
import { OutOfProcessWin32FolderWatcher } from 'vs/workbench/services/files/node/watcher/win32/csharpWatcherService';
import { FileChangesEvent } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { normalize } from 'path';
import { rtrim, endsWith } from 'vs/base/common/strings';
import { sep } from 'vs/base/common/paths';

export class FileWatcher {
	private isDisposed: boolean;

	constructor(
		private contextService: IWorkspaceContextService,
		private ignored: string[],
		private onFileChanges: (changes: FileChangesEvent) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean
	) {
	}

	public startWatching(): () => void {
		let basePath: string = normalize(this.contextService.getWorkspace().roots[0].fsPath);

		if (basePath && basePath.indexOf('\\\\') === 0 && endsWith(basePath, sep)) {
			// for some weird reason, node adds a trailing slash to UNC paths
			// we never ever want trailing slashes as our base path unless
			// someone opens root ("/").
			// See also https://github.com/nodejs/io.js/issues/1765
			basePath = rtrim(basePath, sep);
		}

		const watcher = new OutOfProcessWin32FolderWatcher(
			basePath,
			this.ignored,
			events => this.onRawFileEvents(events),
			error => this.onError(error),
			this.verboseLogging
		);

		return () => {
			this.isDisposed = true;
			watcher.dispose();
		};
	}

	private onRawFileEvents(events: IRawFileChange[]): void {
		if (this.isDisposed) {
			return;
		}

		// Emit through event emitter
		if (events.length > 0) {
			this.onFileChanges(toFileChangesEvent(events));
		}
	}

	private onError(error: string): void {
		if (!this.isDisposed) {
			this.errorLogger(error);
		}
	}
}