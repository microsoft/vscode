/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolExecutionStartToolDescription } from '@github/copilot-sdk';

/** Reads the Copilot SDK's typed MCP Apps resource metadata. */
export function getCopilotSdkToolResourceUri(toolDescription: ToolExecutionStartToolDescription | undefined): string | undefined {
	return toolDescription?._meta?.ui?.resourceUri;
}
