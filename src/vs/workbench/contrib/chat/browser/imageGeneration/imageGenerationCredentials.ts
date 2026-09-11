/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { IImageGenerationConfiguration, IImageGenerationConnection, IImageGenerationCredentialsService, ImageGenerationConnectionSetting, ImageGenerationCredentialsSecret, parseImageGenerationConfiguration } from '../../common/imageGeneration.js';

export class ImageGenerationCredentialsService extends Disposable implements IImageGenerationCredentialsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;
	private _configuration: IImageGenerationConfiguration | undefined;
	private pendingRefresh = Promise.resolve();
	private readonly updates = new Sequencer();
	private updating = false;
	readonly whenReady: Promise<void>;

	get configuration(): IImageGenerationConfiguration | undefined {
		return this._configuration;
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ImageGenerationConnectionSetting)) {
				void this.refresh();
			}
		}));
		this._register(secretStorageService.onDidChangeSecret(key => {
			if (key === ImageGenerationCredentialsSecret) {
				void this.refresh();
			}
		}));
		this.whenReady = this.refresh();
	}

	private readConfiguration(): IImageGenerationConfiguration | undefined {
		const inspected = this.configurationService.inspect<unknown>(ImageGenerationConnectionSetting);
		const value = inspected.applicationValue ?? inspected.userLocalValue;
		return value === undefined ? undefined : parseImageGenerationConfiguration(value);
	}

	private refresh(): Promise<void> {
		if (this.updating) {
			return this.pendingRefresh;
		}
		return this.pendingRefresh = this.pendingRefresh.then(async () => {
			let configuration: IImageGenerationConfiguration | undefined;
			try {
				const configured = this.readConfiguration();
				if (configured) {
					await this.resolve(configured);
					configuration = configured;
				}
			} catch {
				this.logService.warn('[imageGeneration] Credentials are unavailable or no longer match the configured endpoint. Run Set Up Image Generation again.');
			}
			if (!this._store.isDisposed && !equals(this._configuration, configuration)) {
				this._configuration = configuration;
				this._onDidChangeConfiguration.fire();
			}
		});
	}

	async configure(configuration: IImageGenerationConfiguration, key: string): Promise<void> {
		configuration = parseImageGenerationConfiguration(configuration);
		if (!key.trim()) {
			throw new Error(localize('imageGeneration.key.empty', "Enter an API key for the image generation resource."));
		}
		await this.update(configuration, JSON.stringify({ ...configuration, key: key.trim() }));
	}

	async clear(): Promise<void> {
		await this.update(undefined, undefined);
	}

	private writeSecret(value: string | undefined): Promise<void> {
		return value === undefined
			? this.secretStorageService.delete(ImageGenerationCredentialsSecret)
			: this.secretStorageService.set(ImageGenerationCredentialsSecret, value);
	}

	private update(configuration: IImageGenerationConfiguration | undefined, secret: string | undefined): Promise<void> {
		return this.updates.queue(async () => {
			await this.pendingRefresh;
			const previousConfiguration = this.readConfiguration();
			const previousSecret = await this.secretStorageService.get(ImageGenerationCredentialsSecret);
			let secretUpdated = false;
			let settingsUpdated = false;
			this.updating = true;
			try {
				await this.writeSecret(secret);
				secretUpdated = true;
				await this.configurationService.updateValue(ImageGenerationConnectionSetting, configuration, {}, ConfigurationTarget.APPLICATION, { donotNotifyError: true });
				settingsUpdated = true;
				if (configuration) {
					await this.resolve(configuration);
				}
			} catch (error) {
				if (!secretUpdated) {
					throw error;
				}
				try {
					if (await this.secretStorageService.get(ImageGenerationCredentialsSecret) !== secret
						|| settingsUpdated && !equals(this.readConfiguration(), configuration)) {
						throw new Error('Credentials changed during setup');
					}
					await this.writeSecret(previousSecret);
					if (settingsUpdated) {
						await this.configurationService.updateValue(ImageGenerationConnectionSetting, previousConfiguration, {}, ConfigurationTarget.APPLICATION, { donotNotifyError: true });
					}
				} catch {
					throw new Error(localize('imageGeneration.rollback.failed', "Image generation setup failed and the previous connection could not be restored. Run Set Up Image Generation again."));
				}
				throw error;
			} finally {
				this.updating = false;
				await this.refresh();
			}
		});
	}

	async resolve(configuration: IImageGenerationConfiguration): Promise<IImageGenerationConnection> {
		if (!equals(this.readConfiguration(), configuration)) {
			throw new Error(localize('imageGeneration.configuration.changed', "The image generation connection changed. Run the tool again to confirm the new connection."));
		}
		const raw = await this.secretStorageService.get(ImageGenerationCredentialsSecret);
		let parsed: unknown;
		try {
			parsed = raw ? JSON.parse(raw) : undefined;
		} catch {
			throw new Error(localize('imageGeneration.key.invalid', "The stored image generation credentials are invalid. Run Set Up Image Generation again."));
		}
		const stored: { endpoint?: unknown; deployment?: unknown; key?: unknown } = typeof parsed === 'object' && parsed !== null ? parsed : {};
		if (stored.endpoint !== configuration.endpoint || stored.deployment !== configuration.deployment
			|| typeof stored.key !== 'string' || !stored.key.trim()) {
			throw new Error(localize('imageGeneration.key.missing', "No API key matches this image generation connection. Run Set Up Image Generation again."));
		}
		if (!equals(this.readConfiguration(), configuration)) {
			throw new Error(localize('imageGeneration.configuration.changed', "The image generation connection changed. Run the tool again to confirm the new connection."));
		}
		return { ...configuration, headers: { 'api-key': stored.key } };
	}
}
