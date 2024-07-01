/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IStringDictionary } from 'vs/base/common/collections';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';

interface IExtensionEntry {
	version: string;
	extensionIdentifier: {
		id: string;
		uuid: string;
	};
}

interface ILanguagePackEntry {
	hash: string;
	extensions: IExtensionEntry[];
}

interface ILanguagePackFile {
	[locale: string]: ILanguagePackEntry;
}

export class LanguagePackCachedDataCleaner extends Disposable {

	private readonly _DataMaxAge = this.productService.quality !== 'stable'
		? 1000 * 60 * 60 * 24 * 7 		// roughly 1 week (insiders)
		: 1000 * 60 * 60 * 24 * 30 * 3; // roughly 3 months (stable)

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService
	) {
		super();

		// We have no Language pack support for dev version (run from source)
		// So only cleanup when we have a build version.
		if (this.environmentService.isBuilt) {
			const scheduler = this._register(new RunOnceScheduler(() => {
				this.cleanUpLanguagePackCache();
			}, 40 * 1000 /* after 40s */));
			scheduler.schedule();
		}
	}

	private async cleanUpLanguagePackCache(): Promise<void> {
		this.logService.trace('[language pack cache cleanup]: Starting to clean up unused language packs.');

		try {
			const installed: IStringDictionary<boolean> = Object.create(null);
			const metaData: ILanguagePackFile = JSON.parse(await fs.promises.readFile(join(this.environmentService.userDataPath, 'languagepacks.json'), 'utf8'));
			for (const locale of Object.keys(metaData)) {
				const entry = metaData[locale];
				installed[`${entry.hash}.${locale}`] = true;
			}

			// Cleanup entries for language packs that aren't installed anymore
			const cacheDir = join(this.environmentService.userDataPath, 'clp');
			const cacheDirExists = await Promises.exists(cacheDir);
			if (!cacheDirExists) {
				return;
			}

			const entries = await Promises.readdir(cacheDir);
			for (const entry of entries) {
				if (installed[entry]) {
					this.logService.trace(`[language pack cache cleanup]: Skipping folder ${entry}. Language pack still in use.`);
					continue;
				}

				this.logService.trace(`[language pack cache cleanup]: Removing unused language pack: ${entry}`);

				await Promises.rm(join(cacheDir, entry));
			}

			const now = Date.now();
			for (const packEntry of Object.keys(installed)) {
				const folder = join(cacheDir, packEntry);
				const entries = await Promises.readdir(folder);
				for (const entry of entries) {
					if (entry === 'tcf.json') {
						continue;
					}

					const candidate = join(folder, entry);
					const stat = await fs.promises.stat(candidate);
					if (stat.isDirectory() && (now - stat.mtime.getTime()) > this._DataMaxAge) {
						this.logService.trace(`[language pack cache cleanup]: Removing language pack cache folder: ${join(packEntry, entry)}`);

						await Promises.rm(candidate);
					}
				}
			}
		} catch (error) {
			onUnexpectedError(error);
		}
	}
}
