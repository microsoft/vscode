/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolExecutionStartToolDescription } from '@github/copilot-sdk';

/** Reads the Copilot SDK's typed MCP Apps resource metadata. */
export function getCopilotSdkToolResourceUri(toolDescription: ToolExecutionStartToolDescription | undefined): string | undefined {
	return toolDescription?._meta?.ui?.resourceUri;
}

/** Reads MCP Apps resource metadata from an untyped Copilot SDK event payload. */
export function readCopilotSdkToolResourceUri(source: unknown): string | undefined {
	if (!source || typeof source !== 'object' || Array.isArray(source)) {
		return undefined;
	}
	const toolDescription = (source as Record<string, unknown>)['toolDescription'];
	if (!toolDescription || typeof toolDescription !== 'object' || Array.isArray(toolDescription)) {
		return undefined;
	}
	const meta = (toolDescription as Record<string, unknown>)['_meta'];
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	const ui = (meta as Record<string, unknown>)['ui'];
	if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
		return undefined;
	}
	const resourceUri = (ui as Record<string, unknown>)['resourceUri'];
	return typeof resourceUri === 'string' && resourceUri.length > 0 ? resourceUri : undefined;
}
