/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from 'worker_threads';
import { DefaultLinesDiffComputer } from '../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import type { ILinesDiffComputerOptions } from '../../../editor/common/diff/linesDiffComputer.js';
import type { IDiffCountResult } from '../common/diffComputeService.js';

export function computeDiffCounts(originalText: string, modifiedText: string, timeoutMs: number): IDiffCountResult {
	const originalLines = originalText.split(/\r\n|\r|\n/);
	const modifiedLines = modifiedText.split(/\r\n|\r|\n/);
	const diffComputer = new DefaultLinesDiffComputer();
	const options: ILinesDiffComputerOptions = {
		ignoreTrimWhitespace: true,
		maxComputationTimeMs: timeoutMs,
		computeMoves: false,
	};
	const result = diffComputer.computeDiff(originalLines, modifiedLines, options);

	let added = 0;
	let removed = 0;
	for (const change of result.changes) {
		removed += change.original.length;
		added += change.modified.length;
	}

	return { added, removed };
}

function main() {
	const port = parentPort;
	if (!port) {
		throw new Error('This module should only be used in a worker thread.');
	}

	port.on('message', ({ id, fn, args }: { id: number; fn: string; args: unknown[] }) => {
		try {
			if (fn === 'computeDiffCounts') {
				const res = computeDiffCounts(args[0] as string, args[1] as string, args[2] as number);
				port.postMessage({ id, res });
			} else {
				port.postMessage({ id, err: { message: `Unknown function: ${fn}` } });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			port.postMessage({ id, err: { message, stack } });
		}
	});
}

main();
