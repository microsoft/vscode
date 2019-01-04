/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as crypto from 'crypto';
import * as fs from 'fs';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ChecksumPair, IIntegrityService, IntegrityTestResult } from 'vs/platform/integrity/common/integrity';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import product from 'vs/platform/node/product';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

interface IStorageData {
	dontShowPrompt: boolean;
	commit: string | undefined;
}

class IntegrityStorage {
	private static readonly KEY = 'integrityService';

	private storageService: IStorageService;
	private value: IStorageData | null;

	constructor(storageService: IStorageService) {
		this.storageService = storageService;
		this.value = this._read();
	}

	private _read(): IStorageData | null {
		let jsonValue = this.storageService.get(IntegrityStorage.KEY, StorageScope.GLOBAL);
		if (!jsonValue) {
			return null;
		}
		try {
			return JSON.parse(jsonValue);
		} catch (err) {
			return null;
		}
	}

	get(): IStorageData | null {
		return this.value;
	}

	set(data: IStorageData | null): void {
		this.value = data;
		this.storageService.store(IntegrityStorage.KEY, JSON.stringify(this.value), StorageScope.GLOBAL);
	}
}

export class IntegrityServiceImpl implements IIntegrityService {

	_serviceBrand: any;

	private _storage: IntegrityStorage;
	private _isPurePromise: Promise<IntegrityTestResult>;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
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
			return; // Do not prompt
		}

		this.notificationService.prompt(
			Severity.Warning,
			nls.localize('integrity.prompt', "Your {0} installation appears to be corrupt. Please reinstall.", product.nameShort),
			[
				{
					label: nls.localize('integrity.moreInformation', "More Information"),
					run: () => window.open(URI.parse(product.checksumFailMoreInfoUrl).toString(true))
				},
				{
					label: nls.localize('integrity.dontShowAgain', "Don't Show Again"),
					isSecondary: true,
					run: () => this._storage.set({ dontShowPrompt: true, commit: product.commit })
				}
			],
			{ sticky: true }
		);
	}

	isPure(): Promise<IntegrityTestResult> {
		return this._isPurePromise;
	}

	private _isPure(): Promise<IntegrityTestResult> {
		const expectedChecksums = product.checksums || {};

		return this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
			let asyncResults: Promise<ChecksumPair>[] = Object.keys(expectedChecksums).map((filename) => {
				return this._resolve(filename, expectedChecksums[filename]);
			});

			return Promise.all(asyncResults).then<IntegrityTestResult>((allResults) => {
				let isPure = true;
				for (let i = 0, len = allResults.length; isPure && i < len; i++) {
					if (!allResults[i].isPure) {
						isPure = false;
						break;
					}
				}

				return {
					isPure: isPure,
					proof: allResults
				};
			});
		});
	}

	private _resolve(filename: string, expected: string): Promise<ChecksumPair> {
		let fileUri = URI.parse(require.toUrl(filename));
		return new Promise<ChecksumPair>((resolve, reject) => {
			fs.readFile(fileUri.fsPath, (err, buff) => {
				if (err) {
					return reject(err);
				}
				resolve(IntegrityServiceImpl._createChecksumPair(fileUri, this._computeChecksum(buff), expected));
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
