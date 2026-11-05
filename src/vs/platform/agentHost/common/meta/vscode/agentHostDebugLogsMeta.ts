/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { ProgressParams } from '../../state/sessionActions.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';

export const AgentHostDebugLogsCancellationCapabilityMetaKey = 'vscode.debugLogsCancellation';
const AgentHostAhpLogDirectoryMetaKey = 'vscode.ahpLogDirectory';

export function getAgentHostAhpLogDirectoryMeta(directory: URI | undefined): Record<string, unknown> {
	return directory ? { [AgentHostAhpLogDirectoryMetaKey]: directory.toString() } : {};
}

export function readAgentHostAhpLogDirectory(result: InitializeResult | undefined): URI | undefined {
	const value = result?._meta?.[AgentHostAhpLogDirectoryMetaKey];
	if (typeof value !== 'string') {
		return undefined;
	}
	try {
		const resource = URI.parse(value, true);
		return resource.path ? resource : undefined;
	} catch {
		return undefined;
	}
}

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
