/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsCursorPlacement } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';

export interface INesConfigs {
	isAsyncCompletions: boolean;
}

/**
 * Snapshot of the experiment-based configuration values read once per NES request on
 * the main request path (`_getNextEditCanThrow` -> `fetchNextEdit` ->
 * `_executeNewNextEditRequest` / `computeMinimumResponseDelay`). Reading these once up
 * front and threading the snapshot keeps `getExperimentBasedConfig` calls out of the
 * individual methods. Extends {@link INesConfigs} so the telemetry-facing subset stays
 * intact.
 */
export interface INesRequestConfigs extends INesConfigs {
	debounceUseCoreRequestTime: boolean;
	autoExpandEditWindowLines: number | undefined;
	cacheDelay: number;
	rebasedCacheDelay: number | undefined;
	subsequentCacheDelay: number | undefined;
	speculativeRequestDelay: number | undefined;
}

/**
 * Snapshot of the experiment-based configuration values read once per speculative NES
 * request (`_triggerSpeculativeRequest` -> `_createSpeculativeRequest`). Kept separate
 * from {@link INesRequestConfigs} because the speculative path is a distinct
 * request-producing flow; separating them preserves each flow's experiment-exposure
 * timing (neither flow reads the other's flags).
 */
export interface INesSpeculativeConfigs {
	cursorPlacement: SpeculativeRequestsCursorPlacement;
	autoExpandEditWindowLinesSetting: SpeculativeRequestsAutoExpandEditWindowLines;
	autoExpandEditWindowLines: number | undefined;
}
