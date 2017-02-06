/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import workbenchExt = require('vs/workbench/common/contributions');
import paths = require('vs/base/common/paths');
import async = require('vs/base/common/async');
import winjs = require('vs/base/common/winjs.base');
import { mkdirp, fileExists, readdir } from 'vs/base/node/pfs';
import { onUnexpectedError } from 'vs/base/common/errors';
import lifecycle = require('vs/base/common/lifecycle');
import { readAndRegisterSnippets } from 'vs/editor/node/textMate/TMSnippets';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { watch, FSWatcher } from 'fs';
import { IModeService } from 'vs/editor/common/services/modeService';

export class SnippetsTracker implements workbenchExt.IWorkbenchContribution {
	private static FILE_WATCH_DELAY = 200;

	private snippetFolder: string;
	private toDispose: lifecycle.IDisposable[];
	private watcher: FSWatcher;
	private fileWatchDelayer: async.ThrottledDelayer<void>;

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IModeService private modeService: IModeService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IExtensionService extensionService: IExtensionService
	) {
		this.snippetFolder = paths.join(environmentService.appSettingsHome, 'snippets');

		this.toDispose = [];
		this.fileWatchDelayer = new async.ThrottledDelayer<void>(SnippetsTracker.FILE_WATCH_DELAY);

		extensionService.onReady()
			.then(() => mkdirp(this.snippetFolder))
			.then(() => this.scanUserSnippets())
			.then(() => this.registerListeners())
			.done(undefined, onUnexpectedError);
	}

	private registerListeners(): void {
		var scheduler = new async.RunOnceScheduler(() => {
			this.scanUserSnippets();
		}, 500);
		this.toDispose.push(scheduler);

		try {
			this.watcher = watch(this.snippetFolder); // will be persistent but not recursive
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

	private scanUserSnippets(): winjs.Promise {
		return readFilesInDir(this.snippetFolder, /\.json$/).then(snippetFiles => {
			return winjs.TPromise.join(snippetFiles.map(snippetFile => {
				var modeId = snippetFile.replace(/\.json$/, '').toLowerCase();
				var snippetPath = paths.join(this.snippetFolder, snippetFile);
				let languageIdentifier = this.modeService.getLanguageIdentifier(modeId);
				if (languageIdentifier) {
					return readAndRegisterSnippets(languageIdentifier, snippetPath, localize('userSnippet', "User Snippet"));
				}
				return undefined;
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

function readFilesInDir(dirPath: string, namePattern: RegExp = null): winjs.TPromise<string[]> {
	return readdir(dirPath).then((children) => {
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
