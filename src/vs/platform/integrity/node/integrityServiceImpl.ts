/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {TPromise} from 'vs/base/common/winjs.base';
import {IIntegrityService, IntegrityTestResult, ChecksumPair} from 'vs/platform/integrity/common/integrity';
import {IMessageService} from 'vs/platform/message/common/message';
import product from 'vs/platform/product';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import {Action} from 'vs/base/common/actions';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IOpenerService} from 'vs/platform/opener/common/opener';

interface ILoaderChecksums {
	[scriptSrc:string]: string;
}


interface IStorageData {
	dontShowPrompt: boolean;
	commit: string;
}

class IntegrityStorage {
	private static KEY = 'integrityService';

	private _storageService: IStorageService;
	private _value: IStorageData;

	constructor(storageService: IStorageService) {
		this._storageService = storageService;
		this._value = this._read();
	}

	private _read(): IStorageData {
		let jsonValue = this._storageService.get(IntegrityStorage.KEY, StorageScope.GLOBAL);
		if (!jsonValue) {
			return null;
		}
		try {
			return JSON.parse(jsonValue);
		} catch (err) {
			return null;
		}
	}

	public get(): IStorageData {
		return this._value;
	}

	public set(data:IStorageData): void {
		this._value = data;
		this._storageService.store(IntegrityStorage.KEY, JSON.stringify(this._value), StorageScope.GLOBAL);
	}
}

export class IntegrityServiceImpl implements IIntegrityService {

	public _serviceBrand: any;

	private _messageService: IMessageService;
	private _openerService: IOpenerService;
	private _storage:IntegrityStorage;
	private _loaderChecksums: ILoaderChecksums;
	private _isPurePromise: TPromise<IntegrityTestResult>;

	constructor(
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@IOpenerService openerService: IOpenerService
	) {
		this._messageService = messageService;
		this._openerService = openerService;
		this._storage = new IntegrityStorage(storageService);

		// Fetch checksums from loader
		let loaderChecksums = <ILoaderChecksums>(<any>require).getChecksums();

		// Transform loader checksums to be uri => checksum
		this._loaderChecksums = Object.create(null);
		Object.keys(loaderChecksums).forEach((scriptSrc) => {
			let scriptUri = URI.file(scriptSrc).toString();
			this._loaderChecksums[scriptUri.toString()] = loaderChecksums[scriptSrc];
		});

		this._isPurePromise = this._isPure();

		this.isPure().then(r => {
			if (r.isPure) {
				// all is good
				return;
			}
			this._prompt();
		});
	}

	private _prompt(): void {
		const storedData = this._storage.get();
		if (storedData && storedData.dontShowPrompt && storedData.commit === product.commit) {
			// Do not prompt
			return;
		}
		const OkAction = new Action(
			'integrity.ok',
			nls.localize('integrity.ok', "OK"),
			null,
			true,
			() => TPromise.as(true)
		);
		const DontShowAgainAction = new Action(
			'integrity.dontShowAgain',
			nls.localize('integrity.dontShowAgain', "Don't show again"),
			null,
			true,
			() => {
				this._storage.set({
					dontShowPrompt: true,
					commit: product.commit
				});
				return TPromise.as(true);
			}
		);
		const MoreInfoAction = new Action(
			'integrity.moreInfo',
			nls.localize('integrity.moreInfo', "More information"),
			null,
			true,
			() => {
				const uri = URI.parse(product.checksumFailMoreInfoUrl);
				this._openerService.open(uri);
				return TPromise.as(true);
			}
		);

		this._messageService.show(Severity.Warning, {
			message: nls.localize('integrity.prompt', "Your {0} installation appears to be corrupt. Please reinstall.", product.nameShort),
			actions: [OkAction, MoreInfoAction, DontShowAgainAction]
		});
	}

	public isPure(): TPromise<IntegrityTestResult> {
		return this._isPurePromise;
	}

	private _isPure(): TPromise<IntegrityTestResult> {
		const expectedChecksums = product.checksums || {};
		let syncResults: ChecksumPair[] = [];
		let asyncResults: TPromise<ChecksumPair>[] = [];
		Object.keys(expectedChecksums).forEach((filename) => {
			let r = this._resolve(filename, expectedChecksums[filename]);
			if (TPromise.is(r)) {
				asyncResults.push(r);
			} else {
				syncResults.push(r);
			}
		});

		return TPromise.join(asyncResults).then<IntegrityTestResult>((asyncResults) => {
			let allResults = syncResults.concat(asyncResults);
			let isPure = true;
			for (let i = 0, len = allResults.length; isPure && i < len; i++) {
				if (!allResults[i].isPure) {
					isPure = false;
				}
			}

			return {
				isPure: isPure,
				proof: allResults
			};
		});
	}

	private _resolve(filename:string, expected:string): ChecksumPair | TPromise<ChecksumPair> {
		let fileUri = URI.parse(require.toUrl(filename));
		let loaderChecksum = this._loaderChecksums[fileUri.toString()];
		if (loaderChecksum) {
			return IntegrityServiceImpl._createChecksumPair(fileUri, loaderChecksum, expected);
		}
		if (/\.js$/.test(filename)) {
			console.warn(`Did not find checksum for ${filename} in loader checksums.`);
		}
		return new TPromise<ChecksumPair>((c, e, p) => {
			fs.readFile(fileUri.fsPath, (err, buff) => {
				if (err) {
					return e(err);
				}
				c(IntegrityServiceImpl._createChecksumPair(fileUri, this._computeChecksum(buff), expected));
			});
		});
	}

	private _computeChecksum(buff:Buffer): string {
		let hash = crypto
			.createHash('md5')
			.update(buff)
			.digest('base64')
			.replace(/=+$/, '');

		return hash;
	}

	private static _createChecksumPair(uri:URI, actual:string, expected:string): ChecksumPair {
		return {
			uri: uri,
			actual: actual,
			expected: expected,
			isPure: (actual === expected)
		};
	}
}
