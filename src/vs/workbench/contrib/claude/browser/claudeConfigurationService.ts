/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IClaudeConfiguration } from '../common/claudeTypes.js';

export const IClaudeConfigurationService = createDecorator<IClaudeConfigurationService>('claudeConfigurationService');

export interface IClaudeConfigurationService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeConfiguration: Event<IClaudeConfiguration>;

	getConfiguration(): IClaudeConfiguration;
	updateConfiguration(config: Partial<IClaudeConfiguration>): Promise<void>;
	isConfigured(): boolean;
}

export class ClaudeConfigurationService extends Disposable implements IClaudeConfigurationService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<IClaudeConfiguration>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private static readonly STORAGE_KEY = 'claude.configuration';
	private static readonly CONFIG_SECTION = 'claude';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		// Listen for configuration changes
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ClaudeConfigurationService.CONFIG_SECTION)) {
				this._onDidChangeConfiguration.fire(this.getConfiguration());
			}
		}));
	}

	getConfiguration(): IClaudeConfiguration {
		// Priority: 1. Settings, 2. Storage, 3. Environment variables, 4. Defaults
		const settings = this.configurationService.getValue<Partial<IClaudeConfiguration>>(ClaudeConfigurationService.CONFIG_SECTION) || {};
		const stored = this._getStoredConfiguration();

		return {
			apiKey: settings.apiKey || stored.apiKey || process.env.CLAUDE_API_KEY || '',
			baseUrl: settings.baseUrl || stored.baseUrl || 'https://api.anthropic.com',
			model: settings.model || stored.model || 'claude-3-5-sonnet-20241022',
			maxTokens: settings.maxTokens || stored.maxTokens || 4096,
			temperature: settings.temperature ?? stored.temperature ?? 0.7
		};
	}

	async updateConfiguration(config: Partial<IClaudeConfiguration>): Promise<void> {
		const current = this._getStoredConfiguration();
		const updated = { ...current, ...config };

		this.storageService.store(
			ClaudeConfigurationService.STORAGE_KEY,
			JSON.stringify(updated),
			StorageScope.PROFILE,
			StorageTarget.USER
		);

		this._onDidChangeConfiguration.fire(this.getConfiguration());
	}

	isConfigured(): boolean {
		const config = this.getConfiguration();
		return !!config.apiKey;
	}

	private _getStoredConfiguration(): Partial<IClaudeConfiguration> {
		try {
			const stored = this.storageService.get(ClaudeConfigurationService.STORAGE_KEY, StorageScope.PROFILE);
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	}
}
