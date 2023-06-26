/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { isLinux } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IEncryptionService, KnownStorageProvider, isGnome, isKwallet } from 'vs/platform/encryption/common/encryptionService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import { INotificationService, IPromptChoice } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { BaseSecretStorageService } from 'vs/platform/secrets/common/secrets';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class NativeSecretStorageService extends BaseSecretStorageService {

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IEncryptionService encryptionService: IEncryptionService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@ILogService logService: ILogService
	) {
		super(storageService, encryptionService, logService);
	}

	override set(key: string, value: string): Promise<void> {
		this._sequencer.queue(key, async () => {
			await this.initialized;

			if (this.type !== 'persisted') {
				this._logService.trace('[NativeSecretStorageService] Notifying user that secrets are not being stored on disk.');
				await this.notifyOfNoEncryptionOnce();
			}

		});

		return this._sequencer.queue(key, () => super.set(key, value));
	}

	private notifyOfNoEncryptionOnce = once(() => this.notifyOfNoEncryption());
	private async notifyOfNoEncryption(): Promise<void> {
		const buttons: IPromptChoice[] = [];
		const troubleshootingButton: IPromptChoice = {
			label: localize('troubleshootingButton', "Open troubleshooting guide"),
			run: () => this._instantiationService.invokeFunction(accessor => accessor.get(IOpenerService).open('https://go.microsoft.com/fwlink/?linkid=2239490')),
			keepOpen: true
		};
		buttons.push(troubleshootingButton);

		let errorMessage = localize('encryptionNotAvailableJustTroubleshootingGuide', "An OS keyring couldn't be identified for storing the encryption related data in your current desktop environment.");

		if (!isLinux) {
			this._notificationService.prompt(Severity.Error, errorMessage, buttons);
			return;
		}

		const provider = await this._encryptionService.getKeyStorageProvider();
		if (isGnome(provider)) {
			errorMessage = localize('isGnome', "You're running in a GNOME environment but encryption is not available. Ensure you have gnome-keyring or another libsecret compatible implementation installed and running.");
		} else if (isKwallet(provider)) {
			errorMessage = localize('isKwallet', "You're running in a KDE environment but encryption is not available. Ensure you have kwallet running.");
		} else if (provider === KnownStorageProvider.basicText) {
			errorMessage += ' ' + localize('usePlainTextExtraSentence', "Open the troubleshooting guide to address this or you can use weaker encryption that doesn't use the OS keyring.");
			const usePlainTextButton: IPromptChoice = {
				label: localize('usePlainText', "Use weaker encryption (restart required)"),
				run: async () => {
					this._encryptionService.setUsePlainTextEncryption();
					await this._nativeHostService.relaunch();
				}
			};
			buttons.unshift(usePlainTextButton);
		}

		this._notificationService.prompt(Severity.Error, errorMessage, buttons);
	}
}
