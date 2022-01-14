/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, RelativePattern, Uri, workspace } from 'vscode';
import { IDisposable } from './util';

export interface IFileWatcher extends IDisposable {
	readonly event: Event<Uri>;
}

export function watch(location: string): IFileWatcher {
	const watcher = workspace.createFileSystemWatcher(new RelativePattern(location, '*'));

	const onDotGitFileChangeEmitter = new EventEmitter<Uri>();
	watcher.onDidCreate(e => onDotGitFileChangeEmitter.fire(e));
	watcher.onDidChange(e => onDotGitFileChangeEmitter.fire(e));
	watcher.onDidDelete(e => onDotGitFileChangeEmitter.fire(e));

	return new class implements IFileWatcher {
		event = onDotGitFileChangeEmitter.event;
		dispose() {
			watcher.dispose();
			onDotGitFileChangeEmitter.dispose();
		}
	};
}
