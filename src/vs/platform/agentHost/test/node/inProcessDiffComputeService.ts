/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDetailedDiffResult, IDiffComputeService, IDiffCountResult, IDiffHunksResult } from '../../common/diffComputeService.js';
import { computeDetailedDiff, computeDiffCounts, computeDiffHunks } from '../../node/diffWorkerMain.js';

/** Runs the real diff worker functions in-process. */
export class InProcessDiffComputeService implements IDiffComputeService {
	declare readonly _serviceBrand: undefined;

	hitTimeout = false;
	onDetailedDiff: (() => Promise<void>) | undefined;

	async computeDiffCounts(original: string, modified: string): Promise<IDiffCountResult> {
		return computeDiffCounts(original, modified, 5_000);
	}

	async computeDetailedDiff(original: string, modified: string): Promise<IDetailedDiffResult> {
		await this.onDetailedDiff?.();
		const result = computeDetailedDiff(original, modified, 5_000);
		return this.hitTimeout ? { ...result, hitTimeout: true } : result;
	}

	async computeDiffHunks(original: string, modified: string): Promise<IDiffHunksResult> {
		const result = computeDiffHunks(original, modified, 5_000);
		return this.hitTimeout ? { ...result, hitTimeout: true } : result;
	}
}
