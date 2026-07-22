/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { IClaudeAgentSdkLoaderService } from '../common/claudeAgentSdkLoaderService';

/**
 * SDK loader that uses the @anthropic-ai/claude-agent-sdk bundled as a regular
 * dependency of this extension. The SDK is always available.
 */
export class BundledClaudeAgentSdkLoaderService implements IClaudeAgentSdkLoaderService {
	readonly _serviceBrand: undefined;

	get isAvailable(): boolean {
		return true;
	}

	async install(_token: vscode.CancellationToken): Promise<boolean> {
		return true;
	}

	async load(): Promise<typeof AgentSdk> {
		return import('@anthropic-ai/claude-agent-sdk');
	}
}
