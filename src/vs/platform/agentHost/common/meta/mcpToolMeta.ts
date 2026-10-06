/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Whether an MCP tool, as returned by `tools/list`, is offered to the model. MCP Apps declare this
 * in `_meta.ui.visibility`; a tool without a valid declaration is visible to both the model and
 * App views, so only a declaration that omits `"model"` (an app-only tool) hides it.
 */
export function isMcpToolModelVisible(tool: { readonly _meta?: unknown }): boolean {
	const meta = tool._meta;
	if (typeof meta !== 'object' || meta === null) {
		return true;
	}
	const ui = (meta as { readonly ui?: unknown }).ui;
	if (typeof ui !== 'object' || ui === null) {
		return true;
	}
	const visibility = (ui as { readonly visibility?: unknown }).visibility;
	return !Array.isArray(visibility) || visibility.includes('model');
}
