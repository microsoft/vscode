/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IPhononService } from '../common/phonon.js';
import { PhononConfigurationKey } from '../common/phononConfiguration.js';

const PHONON_API_KEY_SECRET = 'phonon.anthropicApiKey';

export class PhononService extends Disposable implements IPhononService {

	declare readonly _serviceBrand: undefined;

	private _apiKeySet = false;
	private _cliAvailable = false;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration: Event<void> = this._onDidChangeConfiguration.event;

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

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
