/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition } from '../../state/protocol/state.js';

const FULL_REFERENCE_NAME_META_KEY = 'vscode.chat.fullReferenceName';

export function withAgentToolFullReferenceName<T extends ToolDefinition>(tool: T, fullReferenceName: string | undefined): T {
	return fullReferenceName ? { ...tool, _meta: { ...tool._meta, [FULL_REFERENCE_NAME_META_KEY]: fullReferenceName } } : tool;
}

export function readAgentToolFullReferenceName(tool: ToolDefinition): string | undefined {
	const value = tool._meta?.[FULL_REFERENCE_NAME_META_KEY];
	return typeof value === 'string' && value ? value : undefined;
}
