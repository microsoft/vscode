/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { TPromise } from 'vs/base/common/winjs.base';
import { IIntegrityService, IntegrityTestResult, ChecksumPair } from 'vs/platform/integrity/common/integrity';
import { IMessageService } from 'vs/platform/message/common/message';
import product from 'vs/platform/node/product';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { Action } from 'vs/base/common/actions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

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

	public set(data: IStorageData): void {
		this._value = data;
		this._storageService.store(IntegrityStorage.KEY, JSON.stringify(this._value), StorageScope.GLOBAL);
	}
}

export class IntegrityServiceImpl implements IIntegrityService {

	public _serviceBrand: any;

	private _messageService: IMessageService;
	private _storage: IntegrityStorage;
	private _isPurePromise: TPromise<IntegrityTestResult>;

	constructor(
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService
	) {
		this._messageService = messageService;
		this._storage = new IntegrityStorage(storageService);

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
		const okAction = new Action(
			'integrity.ok',
			nls.localize('integrity.ok', "OK"),
			null,
			true,
			() => TPromise.as(true)
		);
		const dontShowAgainAction = new Action(
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
		const moreInfoAction = new Action(
			'integrity.moreInfo',
			nls.localize('integrity.moreInfo', "More information"),
			null,
			true,
			() => {
				const uri = URI.parse(product.checksumFailMoreInfoUrl);
				window.open(uri.toString(true));
				return TPromise.as(true);
			}
		);

		this._messageService.show(Severity.Warning, {
			message: nls.localize('integrity.prompt', "Your {0} installation appears to be corrupt. Please reinstall.", product.nameShort),
			actions: [okAction, moreInfoAction, dontShowAgainAction]
		});
	}

	public isPure(): TPromise<IntegrityTestResult> {
		return this._isPurePromise;
	}

	private _isPure(): TPromise<IntegrityTestResult> {
		const expectedChecksums = product.checksums || {};

		return TPromise.timeout(10000).then(() => {
			let asyncResults: TPromise<ChecksumPair>[] = Object.keys(expectedChecksums).map((filename) => {
				return this._resolve(filename, expectedChecksums[filename]);
			});

			return TPromise.join(asyncResults).then<IntegrityTestResult>((allResults) => {
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
		});
	}

	private _resolve(filename: string, expected: string): TPromise<ChecksumPair> {
		let fileUri = URI.parse(require.toUrl(filename));
		return new TPromise<ChecksumPair>((c, e, p) => {
			fs.readFile(fileUri.fsPath, (err, buff) => {
				if (err) {
					return e(err);
				}
				c(IntegrityServiceImpl._createChecksumPair(fileUri, this._computeChecksum(buff), expected));
			});
		});
	}

	private _computeChecksum(buff: Buffer): string {
		let hash = crypto
			.createHash('md5')
			.update(buff)
			.digest('base64')
			.replace(/=+$/, '');

		return hash;
	}

	private static _createChecksumPair(uri: URI, actual: string, expected: string): ChecksumPair {
		return {
			uri: uri,
			actual: actual,
			expected: expected,
			isPure: (actual === expected)
		};
	}
}
