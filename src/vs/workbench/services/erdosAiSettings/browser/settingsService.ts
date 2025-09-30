/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IErdosAiSettingsService } from '../common/settingsService.js';

/**
 * Centralized model-to-provider mapping - THE SINGLE SOURCE OF TRUTH
 * All provider inference should use this mapping instead of string matching
 */
const MODEL_PROVIDER_MAPPING: Record<string, 'openai' | 'anthropic' | 'sagemaker'> = {
	// OpenAI Models
	'gpt-4.1-mini': 'openai',
	'gpt-4.1': 'openai',
	'gpt-5-mini': 'openai',
	'gpt-5': 'openai',
	'o1': 'openai',
	'o3': 'openai',
	'o4-mini': 'openai',
	
	// Anthropic Models
	'claude-sonnet-4-5-20250929': 'anthropic',
	'claude-3-5-haiku-latest': 'anthropic',
	
	// SageMaker Models
	'Qwen/Qwen3-Coder-30B-A3B-Instruct': 'sagemaker'
};

export class ErdosAiSettingsService extends Disposable implements IErdosAiSettingsService {
	readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async getAvailableModels(): Promise<string[]> {
		// Check BYOK settings to determine which models should be available
		const anthropicBYOKEnabled = await this.getBYOKAnthropicEnabled();
		const openAiBYOKEnabled = await this.getBYOKOpenAiEnabled();
		const sagemakerBYOKEnabled = await this.getBYOKSagemakerEnabled();
		
		const claudeModels = ['claude-sonnet-4-5-20250929'];
		const openaiModels = ['gpt-5-mini'];
		const sagemakerModels = ['Qwen/Qwen3-Coder-30B-A3B-Instruct'];
		
		let availableModels: string[] = [];
		
		if (anthropicBYOKEnabled) {
			availableModels = availableModels.concat(claudeModels);
		}
		
		if (openAiBYOKEnabled) {
			availableModels = availableModels.concat(openaiModels);
		}
		
		if (sagemakerBYOKEnabled) {
			const endpointName = await this.getSagemakerEndpointName();
			if (endpointName) {
				availableModels = availableModels.concat(sagemakerModels);
			}
		}
		
		// If no BYOK is enabled, return default models
		if (availableModels.length === 0) {
			availableModels = claudeModels.concat(openaiModels);
		}
		
		return availableModels;
	}

	async getSelectedModel(): Promise<string> {		
		const configuredModel = this.configurationService.getValue<string>('erdosAi.selectedModel');
		
		// Get available models based on BYOK settings
		const availableModels = await this.getAvailableModels();
		
		// If there's a configured model and it's available, use it
		if (configuredModel && availableModels.includes(configuredModel)) {
			return configuredModel;
		}
		
		// Otherwise, use the first available model as default
		const defaultModel = availableModels[0] || 'claude-sonnet-4-5-20250929';
		
		// If we're using a different model than configured, update the configuration
		if (defaultModel !== configuredModel) {
			await this.setSelectedModel(defaultModel);
		}
		
		return defaultModel;
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

	async getInteractionMode(): Promise<'ask' | 'agent'> {
		return this.configurationService.getValue<'ask' | 'agent'>('erdosAi.interactionMode') || 'ask';
	}

	async setInteractionMode(mode: 'ask' | 'agent'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.interactionMode', mode);
			return true;
		} catch (error) {
			this.logService.error('Failed to set interaction mode:', error);
			return false;
		}
	}

	async getAutoAcceptEdits(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptEdits') || false;
	}

	async setAutoAcceptEdits(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptEdits', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept edits:', error);
			return false;
		}
	}

	async getAutoAcceptDeletes(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptDeletes') || false;
	}

	async setAutoAcceptDeletes(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptDeletes', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept deletes:', error);
			return false;
		}
	}

	// Terminal auto-accept settings
	async getAutoAcceptTerminal(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptTerminal') || false;
	}

	async setAutoAcceptTerminal(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptTerminal', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept terminal:', error);
			return false;
		}
	}

	async getTerminalAutoAcceptMode(): Promise<'allow-list' | 'deny-list'> {
		return this.configurationService.getValue<'allow-list' | 'deny-list'>('erdosAi.terminalAutoAcceptMode') || 'allow-list';
	}

	async setTerminalAutoAcceptMode(mode: 'allow-list' | 'deny-list'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.terminalAutoAcceptMode', mode);
			return true;
		} catch (error) {
			this.logService.error('Failed to set terminal auto-accept mode:', error);
			return false;
		}
	}

	async getTerminalAllowList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.terminalAllowList') || [];
	}

	async setTerminalAllowList(commands: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.terminalAllowList', commands);
			return true;
		} catch (error) {
			this.logService.error('Failed to set terminal allow list:', error);
			return false;
		}
	}

	async addToTerminalAllowList(command: string): Promise<boolean> {
		try {
			const currentList = await this.getTerminalAllowList();
			if (!currentList.includes(command)) {
				const newList = [...currentList, command];
				return await this.setTerminalAllowList(newList);
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to add to terminal allow list:', error);
			return false;
		}
	}

	async removeFromTerminalAllowList(command: string): Promise<boolean> {
		try {
			const currentList = await this.getTerminalAllowList();
			const newList = currentList.filter(cmd => cmd !== command);
			return await this.setTerminalAllowList(newList);
		} catch (error) {
			this.logService.error('Failed to remove from terminal allow list:', error);
			return false;
		}
	}

	async getTerminalDenyList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.terminalDenyList') || [];
	}

	async setTerminalDenyList(commands: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.terminalDenyList', commands);
			return true;
		} catch (error) {
			this.logService.error('Failed to set terminal deny list:', error);
			return false;
		}
	}

	async addToTerminalDenyList(command: string): Promise<boolean> {
		try {
			const currentList = await this.getTerminalDenyList();
			if (!currentList.includes(command)) {
				const newList = [...currentList, command];
				return await this.setTerminalDenyList(newList);
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to add to terminal deny list:', error);
			return false;
		}
	}

	async removeFromTerminalDenyList(command: string): Promise<boolean> {
		try {
			const currentList = await this.getTerminalDenyList();
			const newList = currentList.filter(cmd => cmd !== command);
			return await this.setTerminalDenyList(newList);
		} catch (error) {
			this.logService.error('Failed to remove from terminal deny list:', error);
			return false;
		}
	}

	// Console auto-accept settings (Python/R)
	async getAutoAcceptConsole(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsole') || false;
	}

	async setAutoAcceptConsole(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptConsole', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept console:', error);
			return false;
		}
	}

	async getConsoleAutoAcceptMode(): Promise<'allow-list' | 'deny-list'> {
		return this.configurationService.getValue<'allow-list' | 'deny-list'>('erdosAi.consoleAutoAcceptMode') || 'allow-list';
	}

	async setConsoleAutoAcceptMode(mode: 'allow-list' | 'deny-list'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.consoleAutoAcceptMode', mode);
			return true;
		} catch (error) {
			this.logService.error('Failed to set console auto-accept mode:', error);
			return false;
		}
	}

	async getConsoleLanguageFilter(): Promise<'both' | 'python' | 'r'> {
		return this.configurationService.getValue<'both' | 'python' | 'r'>('erdosAi.consoleLanguageFilter') || 'both';
	}

	async setConsoleLanguageFilter(filter: 'both' | 'python' | 'r'): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.consoleLanguageFilter', filter);
			return true;
		} catch (error) {
			this.logService.error('Failed to set console language filter:', error);
			return false;
		}
	}

	async getConsoleAllowList(): Promise<Array<{function: string, language: 'python' | 'r'}>> {
		return this.configurationService.getValue<Array<{function: string, language: 'python' | 'r'}>>('erdosAi.consoleAllowList') || [];
	}

	async setConsoleAllowList(commands: Array<{function: string, language: 'python' | 'r'}>): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.consoleAllowList', commands, ConfigurationTarget.USER);
			return true;
		} catch (error) {
			this.logService.error('Failed to set console allow list:', error);
			return false;
		}
	}

	async addToConsoleAllowList(functionName: string, language: 'python' | 'r'): Promise<boolean> {
		try {
			const currentList = await this.getConsoleAllowList();
			const exists = currentList.some(item => item.function === functionName && item.language === language);
			if (!exists) {
				const newList = [...currentList, { function: functionName, language }];
				return await this.setConsoleAllowList(newList);
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to add to console allow list:', error);
			return false;
		}
	}

	async removeFromConsoleAllowList(functionName: string, language: 'python' | 'r'): Promise<boolean> {
		try {
			const currentList = await this.getConsoleAllowList();
			const newList = currentList.filter(item => !(item.function === functionName && item.language === language));
			return await this.setConsoleAllowList(newList);
		} catch (error) {
			this.logService.error('Failed to remove from console allow list:', error);
			return false;
		}
	}

	async getConsoleDenyList(): Promise<Array<{function: string, language: 'python' | 'r'}>> {
		return this.configurationService.getValue<Array<{function: string, language: 'python' | 'r'}>>('erdosAi.consoleDenyList') || [];
	}

	async setConsoleDenyList(commands: Array<{function: string, language: 'python' | 'r'}>): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.consoleDenyList', commands, ConfigurationTarget.USER);
			return true;
		} catch (error) {
			this.logService.error('Failed to set console deny list:', error);
			return false;
		}
	}

	async addToConsoleDenyList(functionName: string, language: 'python' | 'r'): Promise<boolean> {
		try {
			const currentList = await this.getConsoleDenyList();
			const exists = currentList.some(item => item.function === functionName && item.language === language);
			if (!exists) {
				const newList = [...currentList, { function: functionName, language }];
				return await this.setConsoleDenyList(newList);
			}
			return true;
		} catch (error) {
			this.logService.error('Failed to add to console deny list:', error);
			return false;
		}
	}

	async removeFromConsoleDenyList(functionName: string, language: 'python' | 'r'): Promise<boolean> {
		try {
			const currentList = await this.getConsoleDenyList();
			const newList = currentList.filter(item => !(item.function === functionName && item.language === language));
			return await this.setConsoleDenyList(newList);
		} catch (error) {
			this.logService.error('Failed to remove from console deny list:', error);
			return false;
		}
	}

	// User rules settings
	async getUserRules(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.userRules') || [];
	}

	async addUserRule(rule: string): Promise<boolean> {
		try {
			if (!rule || !rule.trim()) {
				throw new Error('Invalid rule');
			}
			const currentRules = await this.getUserRules();
			const updatedRules = [...currentRules, rule.trim()];
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to add user rule:', error);
			return false;
		}
	}

	async editUserRule(index: number, rule: string): Promise<boolean> {
		try {
			if (!rule || !rule.trim()) {
				throw new Error('Invalid rule');
			}
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = [...currentRules];
			updatedRules[index] = rule.trim();
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to edit user rule:', error);
			return false;
		}
	}

	async deleteUserRule(index: number): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = currentRules.filter((_, i) => i !== index);
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to delete user rule:', error);
			return false;
		}
	}

	// Model-Provider mapping methods
	getProviderForModel(model: string): 'openai' | 'anthropic' | 'sagemaker' {
		const provider = MODEL_PROVIDER_MAPPING[model];
		if (!provider) {
			this.logService.warn(`Unknown model: ${model}. Defaulting to OpenAI.`);
			return 'openai';
		}
		return provider;
	}

	getModelsByProvider(provider: 'openai' | 'anthropic' | 'sagemaker'): string[] {
		return Object.entries(MODEL_PROVIDER_MAPPING)
			.filter(([, modelProvider]) => modelProvider === provider)
			.map(([model]) => model);
	}

	getAllSupportedModels(): string[] {
		return Object.keys(MODEL_PROVIDER_MAPPING);
	}

	isModelSupported(model: string): boolean {
		return model in MODEL_PROVIDER_MAPPING;
	}

	// BYOK (Bring Your Own Key) settings
	async getBYOKAnthropicEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.byokAnthropicEnabled') ?? false;
	}

	async setBYOKAnthropicEnabled(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.byokAnthropicEnabled', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set BYOK Anthropic enabled:', error);
			return false;
		}
	}

	async getBYOKOpenAiEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.byokOpenAiEnabled') ?? false;
	}

	async setBYOKOpenAiEnabled(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.byokOpenAiEnabled', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set BYOK OpenAI enabled:', error);
			return false;
		}
	}

	async getBYOKSagemakerEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.byokSagemakerEnabled') ?? false;
	}

	async setBYOKSagemakerEnabled(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.byokSagemakerEnabled', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set BYOK SageMaker enabled:', error);
			return false;
		}
	}

	async getSagemakerEndpointName(): Promise<string> {
		return this.configurationService.getValue<string>('erdosAi.sagemakerEndpointName') ?? '';
	}

	async setSagemakerEndpointName(endpointName: string): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.sagemakerEndpointName', endpointName);
			return true;
		} catch (error) {
			this.logService.error('Failed to set SageMaker endpoint name:', error);
			return false;
		}
	}

	async getSagemakerRegion(): Promise<string> {
		return this.configurationService.getValue<string>('erdosAi.sagemakerRegion') ?? 'us-east-1';
	}

	async setSagemakerRegion(region: string): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.sagemakerRegion', region);
			return true;
		} catch (error) {
			this.logService.error('Failed to set SageMaker region:', error);
			return false;
		}
	}
}





