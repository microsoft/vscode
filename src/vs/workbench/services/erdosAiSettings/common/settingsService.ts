/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosAiSettingsService = createDecorator<IErdosAiSettingsService>('erdosAiSettingsService');

export interface IErdosAiSettingsService {
	readonly _serviceBrand: undefined;

	// Model settings
	getAvailableModels(): Promise<string[]>;
	getSelectedModel(): Promise<string>;
	setSelectedModel(model: string): Promise<boolean>;

	// Temperature settings
	getTemperature(): Promise<number>;
	setTemperature(temperature: number): Promise<boolean>;

	// Security settings
	getSecurityMode(): Promise<'secure' | 'improve'>;
	setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean>;

	// Web search settings
	getWebSearchEnabled(): Promise<boolean>;
	setWebSearchEnabled(enabled: boolean): Promise<boolean>;

	// Auto-accept settings
	getAutoAcceptEdits(): Promise<boolean>;
	setAutoAcceptEdits(enabled: boolean): Promise<boolean>;
	getAutoAcceptDeletes(): Promise<boolean>;
	setAutoAcceptDeletes(enabled: boolean): Promise<boolean>;

	// Terminal auto-accept settings
	getAutoAcceptTerminal(): Promise<boolean>;
	setAutoAcceptTerminal(enabled: boolean): Promise<boolean>;

	getTerminalAutoAcceptMode(): Promise<'allow-list' | 'deny-list'>;
	setTerminalAutoAcceptMode(mode: 'allow-list' | 'deny-list'): Promise<boolean>;

	getTerminalAllowList(): Promise<string[]>;
	setTerminalAllowList(commands: string[]): Promise<boolean>;
	addToTerminalAllowList(command: string): Promise<boolean>;
	removeFromTerminalAllowList(command: string): Promise<boolean>;

	getTerminalDenyList(): Promise<string[]>;
	setTerminalDenyList(commands: string[]): Promise<boolean>;
	addToTerminalDenyList(command: string): Promise<boolean>;
	removeFromTerminalDenyList(command: string): Promise<boolean>;

	// Console auto-accept settings (Python/R)
	getAutoAcceptConsole(): Promise<boolean>;
	setAutoAcceptConsole(enabled: boolean): Promise<boolean>;

	getConsoleAutoAcceptMode(): Promise<'allow-list' | 'deny-list'>;
	setConsoleAutoAcceptMode(mode: 'allow-list' | 'deny-list'): Promise<boolean>;

	getConsoleLanguageFilter(): Promise<'both' | 'python' | 'r'>;
	setConsoleLanguageFilter(filter: 'both' | 'python' | 'r'): Promise<boolean>;

	getConsoleAllowList(): Promise<Array<{function: string, language: 'python' | 'r'}>>;
	setConsoleAllowList(commands: Array<{function: string, language: 'python' | 'r'}>): Promise<boolean>;
	addToConsoleAllowList(functionName: string, language: 'python' | 'r'): Promise<boolean>;
	removeFromConsoleAllowList(functionName: string, language: 'python' | 'r'): Promise<boolean>;

	getConsoleDenyList(): Promise<Array<{function: string, language: 'python' | 'r'}>>;
	setConsoleDenyList(commands: Array<{function: string, language: 'python' | 'r'}>): Promise<boolean>;
	addToConsoleDenyList(functionName: string, language: 'python' | 'r'): Promise<boolean>;
	removeFromConsoleDenyList(functionName: string, language: 'python' | 'r'): Promise<boolean>;

	// User rules settings
	getUserRules(): Promise<string[]>;
	addUserRule(rule: string): Promise<boolean>;
	editUserRule(index: number, rule: string): Promise<boolean>;
	deleteUserRule(index: number): Promise<boolean>;

	// Model-Provider mapping methods
	getProviderForModel(model: string): 'openai' | 'anthropic' | 'sagemaker';
	getModelsByProvider(provider: 'openai' | 'anthropic' | 'sagemaker'): string[];
	getAllSupportedModels(): string[];
	isModelSupported(model: string): boolean;

	// BYOK (Bring Your Own Key) settings
	getBYOKAnthropicEnabled(): Promise<boolean>;
	setBYOKAnthropicEnabled(enabled: boolean): Promise<boolean>;
	getBYOKOpenAiEnabled(): Promise<boolean>;
	setBYOKOpenAiEnabled(enabled: boolean): Promise<boolean>;
	getBYOKSagemakerEnabled(): Promise<boolean>;
	setBYOKSagemakerEnabled(enabled: boolean): Promise<boolean>;
	getSagemakerEndpointName(): Promise<string>;
	setSagemakerEndpointName(endpointName: string): Promise<boolean>;
	getSagemakerRegion(): Promise<string>;
	setSagemakerRegion(region: string): Promise<boolean>;
}





