/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ChecksumPair, IIntegrityService, IntegrityTestResult } from 'vs/workbench/services/integrity/common/integrity';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { INotificationService, NotificationPriority } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { FileAccess, AppResourcePath } from 'vs/base/common/network';
import { IChecksumService } from 'vs/platform/checksum/common/checksumService';
import { ILogService } from 'vs/platform/log/common/log';

interface IStorageData {
	readonly dontShowPrompt: boolean;
	readonly commit: string | undefined;
}

class IntegrityStorage {

	private static readonly KEY = 'integrityService';

	private value: IStorageData | null;

	constructor(private readonly storageService: IStorageService) {
		this.value = this._read();
	}

	private _read(): IStorageData | null {
		const jsonValue = this.storageService.get(IntegrityStorage.KEY, StorageScope.APPLICATION);
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
		this.storageService.store(IntegrityStorage.KEY, JSON.stringify(this.value), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

export class IntegrityService implements IIntegrityService {

	declare readonly _serviceBrand: undefined;

	private readonly _storage = new IntegrityStorage(this.storageService);

	private readonly _isPurePromise = this._isPure();
	isPure(): Promise<IntegrityTestResult> {
		return this._isPurePromise;
	}

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IChecksumService private readonly checksumService: IChecksumService,
		@ILogService private readonly logService: ILogService
	) {
		this._compute();
	}

	private async _compute(): Promise<void> {
		const { isPure } = await this.isPure();
		if (isPure) {
			return; // all is good
		}

		this.logService.warn(`

----------------------------------------------
***	Installation has been modified on disk ***
----------------------------------------------

`);

		const storedData = this._storage.get();
		if (storedData?.dontShowPrompt && storedData.commit === this.productService.commit) {
			return; // Do not prompt
		}

		this._showNotification();
	}

	private async _isPure(): Promise<IntegrityTestResult> {
		const expectedChecksums = this.productService.checksums || {};

		await this.lifecycleService.when(LifecyclePhase.Eventually);

		const allResults = await Promise.all(Object.keys(expectedChecksums).map(filename => this._resolve(<AppResourcePath>filename, expectedChecksums[filename])));

		let isPure = true;
		for (let i = 0, len = allResults.length; i < len; i++) {
			if (!allResults[i].isPure) {
				isPure = false;
				break;
			}
		}

		return {
			isPure,
			proof: allResults
		};
	}

	private async _resolve(filename: AppResourcePath, expected: string): Promise<ChecksumPair> {
		const fileUri = FileAccess.asFileUri(filename);

		try {
			const checksum = await this.checksumService.checksum(fileUri);

			return IntegrityService._createChecksumPair(fileUri, checksum, expected);
		} catch (error) {
			return IntegrityService._createChecksumPair(fileUri, '', expected);
		}
	}

	private static _createChecksumPair(uri: URI, actual: string, expected: string): ChecksumPair {
		return {
			uri: uri,
			actual: actual,
			expected: expected,
			isPure: (actual === expected)
		};
	}

	private _showNotification(): void {
		const checksumFailMoreInfoUrl = this.productService.checksumFailMoreInfoUrl;
		const message = localize('integrity.prompt', "Your {0} installation appears to be corrupt. Please reinstall.", this.productService.nameShort);
		if (checksumFailMoreInfoUrl) {
			this.notificationService.prompt(
				Severity.Warning,
				message,
				[
					{
						label: localize('integrity.moreInformation', "More Information"),
						run: () => this.openerService.open(URI.parse(checksumFailMoreInfoUrl))
					},
					{
						label: localize('integrity.dontShowAgain', "Don't Show Again"),
						isSecondary: true,
						run: () => this._storage.set({ dontShowPrompt: true, commit: this.productService.commit })
					}
				],
				{
					sticky: true,
					priority: NotificationPriority.URGENT
				}
			);
		} else {
			this.notificationService.notify({
				severity: Severity.Warning,
				message,
				sticky: true,
				priority: NotificationPriority.URGENT
			});
		}
	}
}

registerSingleton(IIntegrityService, IntegrityService, InstantiationType.Delayed);
