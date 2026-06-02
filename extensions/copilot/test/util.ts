/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { join } from 'path';
import { SimulationOptions } from './base/simulationOptions';

export const REPO_ROOT = join(__dirname, '..'); // This must hold for both the esbuild bundle location and the source!

export function createScoreRenderer(opts: SimulationOptions, canUseBaseline: boolean): (score: number) => string {
	// We can show pass count only when using the same number of runs as the baseline
	const maxDigitCount = String(opts.nRuns).length;
	return (
		canUseBaseline
			? (score: number) => `${String(score * opts.nRuns).padStart(maxDigitCount, ' ')}`
			: (score: number) => `${String(score.toFixed(1)).padStart(3, ' ')}`
	);
}

export function printTime(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	let seconds = (ms / 1000);
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	seconds -= minutes * 60;
	return `${minutes}m${Math.ceil(seconds)}s`;
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch (_) {
		return false;
	}
}
