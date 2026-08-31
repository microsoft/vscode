/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkerWithRpcProxy } from '../../../util/node/worker';
import { Lazy } from '../../../util/vs/base/common/lazy';
import * as path from '../../../util/vs/base/common/path';
import { Range } from '../../../util/vs/editor/common/core/range';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';

import { existsSync } from 'fs';
import { ILinesDiffComputerOptions, MovedText } from '../../../util/vs/editor/common/diff/linesDiffComputer';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from '../../../util/vs/editor/common/diff/rangeMapping';
import { IDiffService, IDocumentDiff } from '../common/diffService';
import * as diffWorker from '../common/diffWorker';

export class DiffServiceImpl implements IDiffService {

	declare readonly _serviceBrand: undefined;

	private _worker: Lazy<WorkerWithRpcProxy<typeof diffWorker>>;

	constructor(private _useWorker = true) {
		this._worker = new Lazy(() => {
			const workerPath = firstExistingPath([
				path.join(__dirname, 'diffWorker.js'), // after bundling by esbuild
				path.join(__dirname, '../../../../dist/diffWorker.js'), // relative to the typescript source file (for tsx)
			]);

			if (workerPath === undefined) {
				throw new Error('DiffServiceImpl: worker file not found');
			}

			return new WorkerWithRpcProxy<typeof diffWorker>(workerPath, {
				name: 'Diff worker',
			});
		});
	}

	dispose(): void {
		this._worker.rawValue?.terminate();
	}

	async computeDiff(original: string, modified: string, options: ILinesDiffComputerOptions): Promise<IDocumentDiff> {
		const result = this._useWorker ?
			await this._worker.value.proxy.computeDiff(original, modified, options) :
			await diffWorker.computeDiff(original, modified, options);

		// Convert from space efficient JSON data to rich objects.
		const diff: IDocumentDiff = {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: toLineRangeMappings(result.changes),
			moves: result.moves.map(m => new MovedText(
				new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
				toLineRangeMappings(m[4])
			))
		};
		return diff;
	}
}

export function toLineRangeMappings(changes: readonly diffWorker.ILineChange[]): readonly DetailedLineRangeMapping[] {
	return changes.map(
		(c) => new DetailedLineRangeMapping(
			new LineRange(c[0], c[1]),
			new LineRange(c[2], c[3]),
			c[4]?.map(
				(c) => new RangeMapping(
					new Range(c[0], c[1], c[2], c[3]),
					new Range(c[4], c[5], c[6], c[7])
				)
			)
		)
	);
}

function firstExistingPath(paths: string[]): string | undefined {
	for (const p of paths) {
		if (existsSync(p)) {
			return p;
		}
	}
}
