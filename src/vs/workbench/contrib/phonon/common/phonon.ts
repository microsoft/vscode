/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const PHONON_CLAUDE_VENDOR = 'phonon';
export const PHONON_CLAUDE_AGENT_ID = 'phonon.claude';

export interface IPhononModelInfo {
	readonly id: string;
	readonly name: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly supportsVision: boolean;
	readonly supportsToolCalling: boolean;
}

export const PHONON_MODELS: IPhononModelInfo[] = [
	{
		id: 'claude-opus-4-6',
		name: 'Claude Opus 4.6',
		family: 'claude-opus',
		maxInputTokens: 200000,
		maxOutputTokens: 32000,
		supportsVision: true,
		supportsToolCalling: true,
	},
	{
		id: 'claude-sonnet-4-6',
		name: 'Claude Sonnet 4.6',
		family: 'claude-sonnet',
		maxInputTokens: 200000,
		maxOutputTokens: 16000,
		supportsVision: true,
		supportsToolCalling: true,
	},
	{
		id: 'claude-haiku-4-5-20251001',
		name: 'Claude Haiku 4.5',
		family: 'claude-haiku',
		maxInputTokens: 200000,
		maxOutputTokens: 8192,
		supportsVision: true,
		supportsToolCalling: true,
	},
];

export const IPhononService = createDecorator<IPhononService>('phononService');

export interface IPhononService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the service is configured with a valid API key.
	 */
	readonly isConfigured: boolean;

	/**
	 * The currently selected default model ID.
	 */
	readonly defaultModelId: string;

	/**
	 * Fires when the configuration changes (API key, model, etc.).
	 */
	readonly onDidChangeConfiguration: Event<void>;

	/**
	 * Get the stored API key, or undefined if not set.
	 */
	getApiKey(): Promise<string | undefined>;

	/**
	 * Store the API key in secret storage.
	 */
	setApiKey(key: string): Promise<void>;

	/**
	 * Delete the stored API key.
	 */
	deleteApiKey(): Promise<void>;
}
