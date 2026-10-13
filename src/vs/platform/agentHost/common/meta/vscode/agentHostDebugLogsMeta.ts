/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { ProgressParams } from '../../state/sessionActions.js';
import { hasKey } from '../../../../../base/common/types.js';

export const AgentHostDebugLogsCancellationCapabilityMetaKey = 'vscode.debugLogsCancellation';

export function supportsAgentHostDebugLogsCancellation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostDebugLogsCancellationCapabilityMetaKey] === true;
}

export function isAgentHostDebugLogsProgress(progress: ProgressParams & { readonly _meta?: Record<string, unknown> }): boolean {
	const meta = progress._meta;
	return typeof meta === 'object' && meta !== null && hasKey(meta, { 'vscode.debugLogs': true }) && meta['vscode.debugLogs'] === true;
}

export function withAgentHostDebugLogsProgress(progress: Omit<ProgressParams, 'channel'>) {
	return { ...progress, _meta: { 'vscode.debugLogs': true } };
}
