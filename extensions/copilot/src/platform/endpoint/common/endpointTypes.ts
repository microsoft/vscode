/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace CustomDataPartMimeTypes {
	export const CacheControl = 'cache_control';
	export const StatefulMarker = 'stateful_marker';
	export const ThinkingData = 'thinking';
	export const ContextManagement = 'context_management';
	export const PhaseData = 'phase_data';
	export const Usage = 'usage';
}

export const CacheType = 'ephemeral';

/**
 * Vendors of Copilot's built-in BYOK providers whose converters handle the internal
 * {@link CustomDataPartMimeTypes.CacheControl} sentinel. Others would leak it upstream (#313920).
 *
 * TODO @vritant24: replace with an externally exposed opt-in API (#313920).
 */
export const CacheBreakpointAwareModelVendors: ReadonlySet<string> = new Set(['anthropic', 'gemini', 'openrouter']);

export function modelVendorHandlesCacheBreakpoints(vendor: string | undefined): boolean {
	return vendor !== undefined && CacheBreakpointAwareModelVendors.has(vendor);
}
