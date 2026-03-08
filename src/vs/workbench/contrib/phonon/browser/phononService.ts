/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPhononService } from '../common/phonon.js';
import { PhononConfigurationKey } from '../common/phononConfiguration.js';

const PHONON_API_KEY_SECRET = 'phonon.anthropicApiKey';
const PHONON_APP_MODE_KEY = 'phonon.appMode';

export class PhononService extends Disposable implements IPhononService {

	declare readonly _serviceBrand: undefined;

	private _apiKeySet = false;
	private _cliAvailable = false;
	private _isAppMode: boolean;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration: Event<void> = this._onDidChangeConfiguration.event;

	private readonly _onDidChangeAppMode = this._register(new Emitter<boolean>());
	readonly onDidChangeAppMode: Event<boolean> = this._onDidChangeAppMode.event;

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._isAppMode = this.storageService.getBoolean(PHONON_APP_MODE_KEY, StorageScope.WORKSPACE, false);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PhononConfigurationKey.DefaultModel) || e.affectsConfiguration(PhononConfigurationKey.MaxTokens)) {
				this._onDidChangeConfiguration.fire();
			}
		}));

		this._register(this.secretStorageService.onDidChangeSecret(key => {
			if (key === PHONON_API_KEY_SECRET) {
				this._checkApiKey();
				this._onDidChangeConfiguration.fire();
			}
		}));

		this._checkApiKey();
	}

	get isConfigured(): boolean {
		return this._cliAvailable || this._apiKeySet;
	}

	get cliAvailable(): boolean {
		return this._cliAvailable;
	}

	setCliAvailable(available: boolean): void {
		if (this._cliAvailable !== available) {
			this._cliAvailable = available;
			this._onDidChangeConfiguration.fire();
		}
	}

	get isAppMode(): boolean {
		return this._isAppMode;
	}

	toggleAppMode(): void {
		this._isAppMode = !this._isAppMode;
		this.storageService.store(PHONON_APP_MODE_KEY, this._isAppMode, StorageScope.WORKSPACE, StorageTarget.USER);
		this._onDidChangeAppMode.fire(this._isAppMode);
	}

	get defaultModelId(): string {
		return this.configurationService.getValue<string>(PhononConfigurationKey.DefaultModel) || 'claude-sonnet-4-6';
	}

	async getApiKey(): Promise<string | undefined> {
		return this.secretStorageService.get(PHONON_API_KEY_SECRET);
	}

	async setApiKey(key: string): Promise<void> {
		await this.secretStorageService.set(PHONON_API_KEY_SECRET, key);
	}

	async deleteApiKey(): Promise<void> {
		await this.secretStorageService.delete(PHONON_API_KEY_SECRET);
	}

	private async _checkApiKey(): Promise<void> {
		const key = await this.getApiKey();
		this._apiKeySet = !!key;
	}
}
