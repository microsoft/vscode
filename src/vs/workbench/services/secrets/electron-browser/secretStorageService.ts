/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { isLinux, isMacintosh } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEncryptionService, KnownStorageProvider, PasswordStoreCLIOption, isGnome, isKwallet } from '../../../../platform/encryption/common/encryptionService.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, IPromptChoice } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { BaseSecretStorageService, CROSS_APP_SHARED_SECRET_KEYS, ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { ISharedKeychainService } from '../../../../platform/secrets/common/sharedKeychainService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';

export class NativeSecretStorageService extends BaseSecretStorageService {

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IJSONEditingService private readonly _jsonEditingService: IJSONEditingService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ISharedKeychainService private readonly _sharedKeychainService: ISharedKeychainService,
		@IStorageService storageService: IStorageService,
		@IEncryptionService encryptionService: IEncryptionService,
		@ILogService logService: ILogService
	) {
		super(
			!!_environmentService.useInMemorySecretStorage,
			storageService,
			encryptionService,
			logService
		);
	}

	override get(key: string): Promise<string | undefined> {
		return this._sequencer.queue(key, async () => {
			if (isMacintosh && this.type !== 'in-memory' && CROSS_APP_SHARED_SECRET_KEYS.includes(key)) {
				// Try shared keychain first
				const value = await this._sharedKeychainService.get(key);
				if (value !== undefined) {
					return value;
				}
			}
			// Fall back to old safeStorage+SQLite pipeline
			return this._doGet(key);
		});
	}

	override set(key: string, value: string): Promise<void> {
		this._sequencer.queue(key, async () => {
			await this.resolvedStorageService;

			if (this.type !== 'persisted' && !this._environmentService.useInMemorySecretStorage) {
				this._logService.trace('[NativeSecretStorageService] Notifying user that secrets are not being stored on disk.');
				await this.notifyOfNoEncryptionOnce();
			}
		});
		return this._sequencer.queue(key, async () => {
			if (isMacintosh && this.type !== 'in-memory' && CROSS_APP_SHARED_SECRET_KEYS.includes(key)) {
				// Write to shared keychain
				await this._sharedKeychainService.set(key, value);
			}
			// Also write to legacy pipeline
			await this._doSet(key, value);
		});
	}

	override delete(key: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			if (isMacintosh && this.type !== 'in-memory' && CROSS_APP_SHARED_SECRET_KEYS.includes(key)) {
				// Delete from shared keychain
				await this._sharedKeychainService.delete(key);
			}
			// Delete from legacy pipeline
			await this._doDelete(key);
		});
	}

	override async keys(): Promise<string[]> {
		return this._sequencer.queue('__keys__', async () => {
			const legacyKeys = await this._doGetKeys();
			if (isMacintosh && this.type !== 'in-memory') {
				// Include any cross-app shared keys present in the shared keychain
				for (const sharedKey of CROSS_APP_SHARED_SECRET_KEYS) {
					const sharedValue = await this._sharedKeychainService.get(sharedKey);
					if (sharedValue !== undefined && !legacyKeys.includes(sharedKey)) {
						legacyKeys.push(sharedKey);
					}
				}
			}
			return legacyKeys;
		});
	}

	private notifyOfNoEncryptionOnce = createSingleCallFunction(() => this.notifyOfNoEncryption());
	private async notifyOfNoEncryption(): Promise<void> {
		const buttons: IPromptChoice[] = [];
		const troubleshootingButton: IPromptChoice = {
			label: localize('troubleshootingButton', "Open troubleshooting guide"),
			run: () => this._openerService.open('https://go.microsoft.com/fwlink/?linkid=2239490'),
			// doesn't close dialogs
			keepOpen: true
		};
		buttons.push(troubleshootingButton);

		let errorMessage = localize('encryptionNotAvailableJustTroubleshootingGuide', "An OS keyring couldn't be identified for storing the encryption related data in your current desktop environment.");

		if (!isLinux) {
			this._notificationService.prompt(Severity.Error, errorMessage, buttons);
			return;
		}

		const provider = await this._encryptionService.getKeyStorageProvider();
		if (provider === KnownStorageProvider.basicText) {
			const detail = localize('usePlainTextExtraSentence', "Open the troubleshooting guide to address this or you can use weaker encryption that doesn't use the OS keyring.");
			const usePlainTextButton: IPromptChoice = {
				label: localize('usePlainText', "Use weaker encryption"),
				run: async () => {
					await this._encryptionService.setUsePlainTextEncryption();
					await this._jsonEditingService.write(this._environmentService.argvResource, [{ path: ['password-store'], value: PasswordStoreCLIOption.basic }], true);
					this.reinitialize();
				}
			};
			buttons.unshift(usePlainTextButton);

			await this._dialogService.prompt({
				type: 'error',
				buttons,
				message: errorMessage,
				detail
			});
			return;
		}

		if (isGnome(provider)) {
			errorMessage = localize('isGnome', "You're running in a GNOME environment but the OS keyring is not available for encryption. Ensure you have gnome-keyring or another libsecret compatible implementation installed and running.");
		} else if (isKwallet(provider)) {
			errorMessage = localize('isKwallet', "You're running in a KDE environment but the OS keyring is not available for encryption. Ensure you have kwallet running.");
		}

		this._notificationService.prompt(Severity.Error, errorMessage, buttons);
	}
}

registerSingleton(ISecretStorageService, NativeSecretStorageService, InstantiationType.Delayed);
