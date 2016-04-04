/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import workbenchExt = require('vs/workbench/common/contributions');
import paths = require('vs/base/common/paths');
import async = require('vs/base/common/async');
import winjs = require('vs/base/common/winjs.base');
import extfs = require('vs/base/node/extfs');
import lifecycle = require('vs/base/common/lifecycle');
import tmsnippets = require('vs/editor/node/textMate/TMSnippets');
import {IFileService} from 'vs/platform/files/common/files';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

import fs = require('fs');

export class SnippetsTracker implements workbenchExt.IWorkbenchContribution {
	private static FILE_WATCH_DELAY = 200;

	private snippetFolder: string;
	private toDispose: lifecycle.IDisposable[];
	private watcher: fs.FSWatcher;
	private fileWatchDelayer:async.ThrottledDelayer<void>;

	constructor(
		@IFileService private fileService: IFileService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.snippetFolder = paths.join(contextService.getConfiguration().env.appSettingsHome, 'snippets');

		this.toDispose = [];
		this.fileWatchDelayer = new async.ThrottledDelayer<void>(SnippetsTracker.FILE_WATCH_DELAY);

		if (!fs.existsSync(this.snippetFolder)) {
			fs.mkdirSync(this.snippetFolder);
		}

		this.scanUserSnippets().then(_ => {
			this.registerListeners();
		});
	}

	private registerListeners(): void {
		var scheduler = new async.RunOnceScheduler(() => {
			this.scanUserSnippets();
		}, 500);
		this.toDispose.push(scheduler);

		try {
			this.watcher = fs.watch(this.snippetFolder); // will be persistent but not recursive
			this.watcher.on('change', (eventType: string) => {
				if (eventType === 'delete') {
					this.unregisterListener();
					return;
				}
				scheduler.schedule();
			});
	} catch (error) {
			// the path might not exist anymore, ignore this error and return
		}

		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private scanUserSnippets() : winjs.Promise {
		return readFilesInDir(this.snippetFolder, /\.json$/).then(snippetFiles => {
			return winjs.TPromise.join(snippetFiles.map(snippetFile => {
				var modeId = snippetFile.replace(/\.json$/, '').toLowerCase();
				var snippetPath = paths.join(this.snippetFolder, snippetFile);
				return tmsnippets.snippetUpdated(modeId, snippetPath);
			}));
		});
	}

	private unregisterListener(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}

	public getId(): string {
		return 'vs.snippets.snippetsTracker';
	}

	public dispose(): void {
		this.unregisterListener();
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

function readDir(path: string): winjs.TPromise<string[]> {
	return new winjs.TPromise<string[]>((c, e, p) => {
		extfs.readdir(path,(err, files) => {
			if (err) {
				return e(err);
			}
			c(files);
		});
	});
}

function fileExists(path: string): winjs.TPromise<boolean> {
	return new winjs.TPromise<boolean>((c, e, p) => {
		fs.stat(path,(err, stats) => {
			if (err) {
				return c(false);
			}

			if (stats.isFile()) {
				return c(true);
			}

			c(false);
		});
	});
}

function readFilesInDir(dirPath: string, namePattern:RegExp = null): winjs.TPromise<string[]> {
	return readDir(dirPath).then((children) => {
		return winjs.TPromise.join(
			children.map((child) => {
				if (namePattern && !namePattern.test(child)) {
					return winjs.TPromise.as(null);
				}
				return fileExists(paths.join(dirPath, child)).then(isFile => {
					return isFile ? child : null;
				});
			})
		).then((subdirs) => {
			return subdirs.filter(subdir => (subdir !== null));
		});
	});
}