/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelDefinition, IProviderDefinition } from './multiAgentProviderService.js';

/**
 * Built-in AI provider definitions shipped with VS Code.
 * Users can add custom providers via the Providers UI.
 */
export const BUILT_IN_PROVIDERS: IProviderDefinition[] = [
	{
		id: 'anthropic',
		name: 'Anthropic',
		baseUrl: 'https://api.anthropic.com',
		supportedModels: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'],
		authMethods: ['apiKey'],
		apiFormat: 'anthropic',
	},
	{
		id: 'openai',
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		supportedModels: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
		authMethods: ['apiKey'],
		apiFormat: 'openai',
	},
	{
		id: 'google',
		name: 'Google AI',
		baseUrl: 'https://generativelanguage.googleapis.com',
		supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
		authMethods: ['apiKey'],
		apiFormat: 'google',
	},
	{
		id: 'openrouter',
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		supportedModels: ['claude-opus-4', 'claude-sonnet-4', 'gpt-4o', 'gemini-2.5-pro'],
		authMethods: ['apiKey'],
		apiFormat: 'openai',
	},
];

/**
 * Built-in AI model definitions with provider compatibility.
 */
export const BUILT_IN_MODELS: IModelDefinition[] = [
	// Anthropic models
	{
		id: 'claude-opus-4',
		family: 'claude-opus',
		displayName: 'Claude Opus 4',
		capabilities: ['vision', 'code', 'reasoning', 'tools'],
		compatibleProviders: ['anthropic', 'openrouter'],
		maxContextTokens: 200000,
	},
	{
		id: 'claude-sonnet-4',
		family: 'claude-sonnet',
		displayName: 'Claude Sonnet 4',
		capabilities: ['vision', 'code', 'reasoning', 'tools'],
		compatibleProviders: ['anthropic', 'openrouter'],
		maxContextTokens: 200000,
	},
	{
		id: 'claude-haiku-4',
		family: 'claude-haiku',
		displayName: 'Claude Haiku 4',
		capabilities: ['vision', 'code', 'tools'],
		compatibleProviders: ['anthropic'],
		maxContextTokens: 200000,
	},
	// OpenAI models
	{
		id: 'gpt-4o',
		family: 'gpt-4o',
		displayName: 'GPT-4o',
		capabilities: ['vision', 'code', 'reasoning', 'tools'],
		compatibleProviders: ['openai', 'openrouter'],
		maxContextTokens: 128000,
	},
	{
		id: 'gpt-4o-mini',
		family: 'gpt-4o-mini',
		displayName: 'GPT-4o Mini',
		capabilities: ['vision', 'code', 'tools'],
		compatibleProviders: ['openai'],
		maxContextTokens: 128000,
	},
	{
		id: 'o3',
		family: 'o3',
		displayName: 'o3',
		capabilities: ['code', 'reasoning', 'tools'],
		compatibleProviders: ['openai'],
		maxContextTokens: 200000,
	},
	{
		id: 'o4-mini',
		family: 'o4-mini',
		displayName: 'o4 Mini',
		capabilities: ['code', 'reasoning', 'tools'],
		compatibleProviders: ['openai'],
		maxContextTokens: 200000,
	},
	// Google models
	{
		id: 'gemini-2.5-pro',
		family: 'gemini-2.5',
		displayName: 'Gemini 2.5 Pro',
		capabilities: ['vision', 'code', 'reasoning', 'tools'],
		compatibleProviders: ['google', 'openrouter'],
		maxContextTokens: 1000000,
	},
	{
		id: 'gemini-2.5-flash',
		family: 'gemini-2.5',
		displayName: 'Gemini 2.5 Flash',
		capabilities: ['vision', 'code', 'tools'],
		compatibleProviders: ['google'],
		maxContextTokens: 1000000,
	},
];
