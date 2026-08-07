/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../../util/common/services';

export const CLAUDE_SDK_EXTENSION_ID = 'ms-vscode.vscode-claude-sdk';

export interface IClaudeAgentSdkLoaderService {
	readonly _serviceBrand: undefined;

	/** Whether the SDK is currently available (extension installed or module present). */
	readonly isAvailable: boolean;

	/**
	 * Ensures the SDK is available, installing it if necessary.
	 * Returns true if the SDK is available after the call.
	 */
	install(token: vscode.CancellationToken): Promise<boolean>;

	/** Loads and returns the SDK module. Throws if the SDK cannot be loaded. */
	load(): Promise<typeof AgentSdk>;
}

export const IClaudeAgentSdkLoaderService = createServiceIdentifier<IClaudeAgentSdkLoaderService>('IClaudeAgentSdkLoaderService');
