/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IToolResult } from './languageModelToolsService.js';

export const IToolResultCompressor = createDecorator<IToolResultCompressor>('IToolResultCompressor');

/**
 * Result of running a {@link IToolResultFilter}.
 *
 * `text` is the new text to substitute back into the corresponding text part.
 * `compressed` is `true` if any compression actually happened — used purely
 * for telemetry / accounting.
 */
export interface IToolResultFilterOutput {
	readonly text: string;
	readonly compressed: boolean;
}

/**
 * A pure function that compresses a single text part of a tool result.
 *
 * Implementations MUST never make output worse than the input. If a filter
 * cannot improve a piece of text, it should return the original `text` and
 * `compressed: false`.
 */
export interface IToolResultFilter {
	readonly id: string;
	/** Tool ids this filter applies to. */
	readonly toolIds: readonly string[];
	/**
	 * Decide whether this filter wants to handle the result. May inspect tool
	 * input (e.g. for `run_in_terminal`, the command being run).
	 */
	matches(toolId: string, input: unknown): boolean;
	apply(text: string, input: unknown): IToolResultFilterOutput;
}

export interface IToolResultCompressor {
	readonly _serviceBrand: undefined;
	registerFilter(filter: IToolResultFilter): void;
	/**
	 * Returns a possibly-compressed copy of `result`, or `undefined` if no
	 * compression was applied (caller should pass through the original).
	 */
	maybeCompress(toolId: string, input: unknown, result: IToolResult): IToolResult | undefined;
}

/**
 * Outputs at or below this many characters (UTF-16 code units, i.e.
 * `string.length`) are not worth compressing.
 */
export const MIN_COMPRESSIBLE_LENGTH = 80;

/**
 * Format the banner that gets prepended to compressed text parts so the
 * model knows compression happened, which filters fired, and how to opt out.
 */
export function formatCompressionBanner(filterIds: readonly string[], beforeChars: number, afterChars: number): string {
	const ids = filterIds.length > 0 ? filterIds.join(', ') : 'unknown';
	return `[Output compressed by ${ids} (${beforeChars} → ${afterChars} chars). To disable, set chat.tools.compressOutput.enabled to false.]`;
}
