/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IDiffCountResult {
	added: number;
	removed: number;
}

export const IDiffComputeService = createDecorator<IDiffComputeService>('diffComputeService');

/** Default timeout for diff computation in milliseconds. */
export const DEFAULT_DIFF_TIMEOUT_MS = 5000;

/**
 * Service that computes line diff counts (added/removed) between two
 * text strings. Implementations may offload computation to a worker
 * thread to avoid blocking the main thread.
 */
export interface IDiffComputeService {
	readonly _serviceBrand: undefined;

	/**
	 * Computes line-level diff counts between two text strings.
	 * @param timeoutMs - Maximum time in milliseconds before aborting. Defaults to {@link DEFAULT_DIFF_TIMEOUT_MS}.
	 */
	computeDiffCounts(original: string, modified: string, timeoutMs?: number): Promise<IDiffCountResult>;
}
