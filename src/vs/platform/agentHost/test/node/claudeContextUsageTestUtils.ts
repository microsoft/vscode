/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';

/** A `getContextUsage` report with every required field present and nothing in the window. */
export function makeContextUsageResponse(overrides: Partial<SDKControlGetContextUsageResponse> = {}): SDKControlGetContextUsageResponse {
	return {
		categories: [],
		totalTokens: 0,
		maxTokens: 200_000,
		rawMaxTokens: 200_000,
		percentage: 0,
		gridRows: [],
		model: 'claude-test',
		memoryFiles: [],
		mcpTools: [],
		agents: [],
		isAutoCompactEnabled: true,
		apiUsage: null,
		...overrides,
	};
}
