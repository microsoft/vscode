/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { join } from 'path';
import { mkdirp, fileExists } from 'vs/base/node/pfs';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { readAndRegisterSnippets } from './TMSnippets';
import { ISnippetsService } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { watch } from 'fs';
import { IModeService } from 'vs/editor/common/services/modeService';

export class SnippetsTracker implements IWorkbenchContribution {

	private readonly _snippetFolder: string;
	private readonly _toDispose: IDisposable[];

	constructor(
		@IModeService modeService: IModeService,
		@ISnippetsService snippetService: ISnippetsService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IExtensionService extensionService: IExtensionService
	) {
		this._snippetFolder = join(environmentService.appSettingsHome, 'snippets');
		this._toDispose = [];

		// Whenever a mode is being created check if a snippet file exists
		// and iff so read all snippets from it.
		this._toDispose.push(modeService.onDidCreateMode(mode => {
			const snippetPath = join(this._snippetFolder, `${mode.getId()}.json`);
			fileExists(snippetPath)
				.then(exists => exists && readAndRegisterSnippets(snippetService, mode.getLanguageIdentifier(), snippetPath))
				.done(undefined, onUnexpectedError);
		}));

		// Install a FS watcher on the snippet directory and when an
		// event occurs update the snippets for that one snippet.
		mkdirp(this._snippetFolder).then(() => {
			const watcher = watch(this._snippetFolder);
			this._toDispose.push({ dispose: () => watcher.close() });
			watcher.on('change', (type, filename) => {
				if (typeof filename !== 'string') {
					return;
				}
				extensionService.onReady().then(() => {
					const langName = filename.replace(/\.json$/, '').toLowerCase();
					const langId = modeService.getLanguageIdentifier(langName);
					return langId && readAndRegisterSnippets(snippetService, langId, join(this._snippetFolder, filename));
				}, onUnexpectedError);
			});
		});
	}

	getId(): string {
		return 'vs.snippets.snippetsTracker';
	}

	dispose(): void {
		dispose(this._toDispose);
	}
}
