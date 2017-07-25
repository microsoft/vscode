/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import * as path from 'path';
import * as fs from 'fs';
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
import { IStorageService } from 'vs/platform/storage/node/storage';
import { dialog } from 'electron';
import { getUpdateFeedUrl, Win32UninstallPath } from './updateFeedUrl';

interface IUpdate {
	url: string;
	name: string;
	releaseNotes?: string;
	version: string;
	productVersion: string;
	hash: string;
}

const eventNames = [
	'checking-for-update',
	'update-not-available',
	'update-available',
	'update-downloaded',
	'update-not-available',
	'error'
];

function forwardEvent(eventName: string, source: EventEmitter, target: EventEmitter): void {
	source.on(eventName, (...args) => target.emit(eventName, ...args));
}

export class Win32AutoUpdaterImpl extends EventEmitter implements IAutoUpdater {

	private autoUpdater64: Win32AutoUpdaterImpl = null;

	private url: string = null;
	private currentRequest: Promise = null;
	private updatePackagePath: string = null;

	constructor(
		private arch: string,
		private channel: string,
		@IRequestService private requestService: IRequestService,
		@IStorageService private storageService: IStorageService
	) {
		super();

		if (arch === 'ia32') {
			if (this.storageService.getItem('autoUpdateWin32Prefer64Bits', false)) {
				this.autoUpdater64 = this.create64BitAutoUpdater();
			}
		}
	}

	private create64BitAutoUpdater(): Win32AutoUpdaterImpl {
		const result = new Win32AutoUpdaterImpl('x64', this.channel, this.requestService, this.storageService);
		result.setFeedURL(getUpdateFeedUrl(this.channel, 'bump', 'x64'));
		eventNames.forEach(e => forwardEvent(e, result, this));
		return result;
	}

	private get cachePath(): TPromise<string> {
		const result = path.join(tmpdir(), `vscode-update-${this.arch}`);
		return new TPromise<string>((c, e) => mkdirp(result, null, err => err ? e(err) : c(result)));
	}

	setFeedURL(url: string): void {
		this.url = url;
	}

	checkForUpdates(): void {
		if (this.autoUpdater64) {
			return this.autoUpdater64.checkForUpdates();
		}

		if (!this.url) {
			throw new Error('No feed url set.');
		}

		if (this.currentRequest) {
			return;
		}

		const shouldPromptToMoveTo64Bits = this.arch === 'ia32' && this.storageService.getItem('autoUpdateWin32Propose64bits', true);

		if (shouldPromptToMoveTo64Bits) {
			const result = dialog.showMessageBox({
				title: product.nameLong,
				type: 'question',
				message: localize('propose64', "{0} 64 bits for Windows is now available! Would you like to upgrade to the 64 bit version?", product.nameShort),
				buttons: [localize('yes', "Yes"), localize('no', "No"), localize('neverAgain', "Never Ask Again")],
				noLink: true
			});

			if (result === 2) {
				this.storageService.setItem('autoUpdateWin32Propose64bits', false);
			} else if (result === 0) {
				this.storageService.setItem('autoUpdateWin32Prefer64Bits', true);
				this.autoUpdater64 = this.create64BitAutoUpdater();

				return this.autoUpdater64.checkForUpdates();
			}
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
		if (this.autoUpdater64) {
			return this.autoUpdater64.quitAndInstall();
		}

		if (!this.updatePackagePath) {
			return;
		}

		if (process.arch === 'ia32' && this.arch === 'x64') {
			const updatePackageContents = `@echo off\r\n"${Win32UninstallPath}" /silent\r\nstart /b "" "${this.updatePackagePath}"\r\n`;
			const updatePackagePath = path.join(tmpdir(), 'vscode-update-32-to-64.bat');
			fs.writeFileSync(updatePackagePath, updatePackageContents);

			spawn('cmd', ['/c', 'call', updatePackagePath], {
				detached: true
			});

			return;
		}

		spawn(this.updatePackagePath, ['/silent', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore']
		});
	}
}
