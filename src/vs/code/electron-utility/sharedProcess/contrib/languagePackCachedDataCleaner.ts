/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises } from 'fs';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { Promises } from '../../../../base/node/pfs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

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

	private readonly dataMaxAge: number;

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService
	) {
		super();

		this.dataMaxAge = productService.quality !== 'stable'
			? 1000 * 60 * 60 * 24 * 7 		// roughly 1 week (insiders)
			: 1000 * 60 * 60 * 24 * 30 * 3; // roughly 3 months (stable)

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
			const metaData: ILanguagePackFile = JSON.parse(await promises.readFile(join(this.environmentService.userDataPath, 'languagepacks.json'), 'utf8'));
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
					const stat = await promises.stat(candidate);
					if (stat.isDirectory() && (now - stat.mtime.getTime()) > this.dataMaxAge) {
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
