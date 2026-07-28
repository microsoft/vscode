/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProtectedResourceMetadata } from '../../common/state/protocol/common/state.js';
import type { CodexUsageSource } from '../../common/agentHostCustomizationConfig.js';
import type { GetAccountResponse } from './protocol/generated/v2/GetAccountResponse.js';

export interface ICodexAccountState {
	readonly usageSource: 'openai' | 'copilot';
	readonly status: 'signedIn' | 'signedOut' | 'error';
	readonly authType?: 'chatgpt' | 'apiKey' | 'other';
	readonly planType?: string;
	readonly error?: string;
}

export function codexAccountStateFromResponse(response: GetAccountResponse): ICodexAccountState {
	if (response.account?.type === 'chatgpt') {
		return { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: response.account.planType };
	}
	if (response.account?.type === 'apiKey') {
		return { usageSource: 'openai', status: 'signedIn', authType: 'apiKey' };
	}
	if (response.account) {
		return { usageSource: 'openai', status: 'signedIn', authType: 'other' };
	}
	return { usageSource: 'openai', status: 'signedOut' };
}

export function resolveCodexUsageSourceAfterAccountRead(source: CodexUsageSource, account: ICodexAccountState): CodexUsageSource {
	return source === 'openai' && account.status === 'signedOut' ? 'copilot' : source;
}

export function codexAccountStateForUsageSource(source: CodexUsageSource, openAIAccount: ICodexAccountState): ICodexAccountState {
	return source === 'openai' ? openAIAccount : { ...openAIAccount, usageSource: 'copilot' };
}

export function codexProtectedResourcesForUsageSource(
	source: CodexUsageSource,
	copilotResource: ProtectedResourceMetadata,
	repoResource: ProtectedResourceMetadata,
): ProtectedResourceMetadata[] {
	return [
		source === 'openai' ? { ...copilotResource, required: false } : copilotResource,
		repoResource,
	];
}
