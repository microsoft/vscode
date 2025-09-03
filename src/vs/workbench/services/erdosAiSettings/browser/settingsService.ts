/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IBackendClient } from '../../erdosAiBackend/common/backendClient.js';
import { IErdosAiSettingsService } from '../common/settingsService.js';

export class ErdosAiSettingsService extends Disposable implements IErdosAiSettingsService {
	readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IBackendClient private readonly backendClient: IBackendClient
	) {
		super();
	}

	async getAvailableModels(): Promise<string[]> {
		return await this.backendClient.getAvailableModels();
	}

	async getSelectedModel(): Promise<string> {
		return this.configurationService.getValue<string>('erdosAi.selectedModel') || 'claude-sonnet-4-20250514';
	}

	async setSelectedModel(model: string): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.selectedModel', model);
			return true;
		} catch (error) {
			this.logService.error('Failed to set selected model:', error);
			return false;
		}
	}

	async getTemperature(): Promise<number> {
		return this.configurationService.getValue<number>('erdosAi.temperature') || 0.5;
	}

	async setTemperature(temperature: number): Promise<boolean> {
		try {
			if (temperature < 0 || temperature > 1) {
				throw new Error('Temperature must be between 0 and 1');
			}
			await this.configurationService.updateValue('erdosAi.temperature', temperature);
			return true;
		} catch (error) {
			this.logService.error('Failed to set temperature:', error);
			return false;
		}
	}

	async getSecurityMode(): Promise<'secure' | 'improve'> {
		return this.configurationService.getValue<'secure' | 'improve'>('erdosAi.securityMode') || 'improve';
	}

	async setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.securityMode', mode);
			return true;
		} catch (error) {
			this.logService.error('Failed to set security mode:', error);
			return false;
		}
	}

	async getWebSearchEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.webSearchEnabled') || false;
	}

	async setWebSearchEnabled(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.webSearchEnabled', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set web search enabled:', error);
			return false;
		}
	}
}





