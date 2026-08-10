/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelConfiguration } from './dataTypes/xtabPromptOptions';

export enum InlineEditsUnification {
	CompletionsNes = 'completionsNes',
}

export interface InlineEditsUnificationConfiguration {
	readonly nLinesBelow: number;
	readonly nLinesAbove: number;
	readonly unification: boolean;
	readonly rebasedCacheDelay: number;
	readonly extraDebounceEndOfLine: number;
	readonly debounce: number;
	readonly cacheDelay: number;
}

export const COMPLETIONS_NES_UNIFICATION_DEFAULTS: InlineEditsUnificationConfiguration = {
	nLinesBelow: 7,
	nLinesAbove: 0,
	unification: true,
	rebasedCacheDelay: 0,
	extraDebounceEndOfLine: 0,
	debounce: 0,
	cacheDelay: 200,
};

export function getInlineEditsUnificationDefaults(config: ModelConfiguration | null | undefined): InlineEditsUnificationConfiguration | undefined {
	return config?.unification === InlineEditsUnification.CompletionsNes
		? COMPLETIONS_NES_UNIFICATION_DEFAULTS
		: undefined;
}
