/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import { checksum } from 'vs/base/node/crypto';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { mkdirp } from 'vs/base/node/extfs';
import { isString } from 'vs/base/common/types';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { download, asJson } from 'vs/base/node/request';
import { IRequestService } from 'vs/platform/request/node/request';
import { IAutoUpdater } from 'vs/platform/update/common/update';
import product from 'vs/platform/node/product';

interface IUpdate {
	url: string;
	name: string;
	releaseNotes?: string;
	version: string;
	productVersion: string;
	hash: string;
}

export class Win32AutoUpdaterImpl extends EventEmitter implements IAutoUpdater {

	private url: string = null;
	private currentRequest: Promise = null;
	private updatePackagePath: string = null;

	constructor(
		@IRequestService private requestService: IRequestService
	) {
		super();
	}

	get cachePath(): TPromise<string> {
		const result = path.join(tmpdir(), `vscode-update-${process.arch}`);
		return new TPromise<string>((c, e) => mkdirp(result, null, err => err ? e(err) : c(result)));
	}

	setFeedURL(url: string): void {
		this.url = url;
	}

	checkForUpdates(): void {
		if (!this.url) {
			throw new Error('No feed url set.');
		}

		if (this.currentRequest) {
			return;
		}

		this.emit('checking-for-update');

		this.currentRequest = this.requestService.request({ url: this.url })
			.then<IUpdate>(asJson)
			.then(update => {
				if (!update || !update.url || !update.version) {
					this.emit('update-not-available');
					return this.cleanup();
				}

				this.emit('update-available');

				return this.cleanup(update.version).then(() => {
					return this.getUpdatePackagePath(update.version).then(updatePackagePath => {
						return pfs.exists(updatePackagePath).then(exists => {
							if (exists) {
								return TPromise.as(updatePackagePath);
							}

							const url = update.url;
							const hash = update.hash;
							const downloadPath = `${updatePackagePath}.tmp`;

							return this.requestService.request({ url })
								.then(context => download(downloadPath, context))
								.then(hash ? () => checksum(downloadPath, update.hash) : () => null)
								.then(() => pfs.rename(downloadPath, updatePackagePath))
								.then(() => updatePackagePath);
						});
					}).then(updatePackagePath => {
						this.updatePackagePath = updatePackagePath;

						this.emit('update-downloaded',
							{},
							update.releaseNotes,
							update.productVersion,
							new Date(),
							this.url
						);
					});
				});
			})
			.then(null, e => {
				if (isString(e) && /^Server returned/.test(e)) {
					return;
				}

				this.emit('update-not-available');
				this.emit('error', e);
			})
			.then(() => this.currentRequest = null);
	}

	private getUpdatePackagePath(version: string): TPromise<string> {
		return this.cachePath.then(cachePath => path.join(cachePath, `CodeSetup-${product.quality}-${version}.exe`));
	}

	private cleanup(exceptVersion: string = null): Promise {
		const filter = exceptVersion ? one => !(new RegExp(`${product.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;

		return this.cachePath
			.then(cachePath => pfs.readdir(cachePath)
				.then(all => Promise.join(all
					.filter(filter)
					.map(one => pfs.unlink(path.join(cachePath, one)).then(null, () => null))
				))
			);
	}

	quitAndInstall(): void {
		if (!this.updatePackagePath) {
			return;
		}

		spawn(this.updatePackagePath, ['/silent', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore']
		});
	}
}
