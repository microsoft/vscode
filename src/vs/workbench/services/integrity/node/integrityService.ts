/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as crypto from 'crypto';
import * as fs from 'fs';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ChecksumPair, IIntegrityService, IntegrityTestResult } from 'vs/workbench/services/integrity/common/integrity';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import product from 'vs/platform/product/node/product';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';

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

	_serviceBrand!: ServiceIdentifier<any>;

	private _storage: IntegrityStorage;
	private _isPurePromise: Promise<IntegrityTestResult>;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		this._storage = new IntegrityStorage(storageService);

		this._isPurePromise = this._isPure();

		this.isPure().then(r => {
			if (r.isPure) {
				return; // all is good
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
					run: () => this.openerService.openExternal(URI.parse(product.checksumFailMoreInfoUrl))
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

	private async _isPure(): Promise<IntegrityTestResult> {
		const expectedChecksums = product.checksums || {};

		await this.lifecycleService.when(LifecyclePhase.Eventually);

		const allResults = await Promise.all(Object.keys(expectedChecksums).map(filename => this._resolve(filename, expectedChecksums[filename])));

		let isPure = true;
		for (let i = 0, len = allResults.length; i < len; i++) {
			if (!allResults[i].isPure) {
				isPure = false;
				break;
			}
		}

		return {
			isPure: isPure,
			proof: allResults
		};
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

registerSingleton(IIntegrityService, IntegrityServiceImpl, true);
