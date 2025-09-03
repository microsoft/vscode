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
}





