/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { FoldingRegions, ILineRange } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { IFoldingRangeData, sanitizeRanges } from 'vs/editor/contrib/folding/browser/syntaxRangeProvider';
import { RangeProvider } from './folding';

export const ID_INIT_PROVIDER = 'init';

export class InitializingRangeProvider implements RangeProvider {
	readonly id = ID_INIT_PROVIDER;

	private decorationIds: string[] | undefined;
	private timeout: any;

	constructor(private readonly editorModel: ITextModel, initialRanges: ILineRange[], onTimeout: () => void, timeoutTime: number) {
		if (initialRanges.length) {
			const toDecorationRange = (range: ILineRange): IModelDeltaDecoration => {
				return {
					range: {
						startLineNumber: range.startLineNumber,
						startColumn: 0,
						endLineNumber: range.endLineNumber,
						endColumn: editorModel.getLineLength(range.endLineNumber)
					},
					options: {
						description: 'folding-initializing-range-provider',
						stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
					}
				};
			};
			this.decorationIds = editorModel.deltaDecorations([], initialRanges.map(toDecorationRange));
			this.timeout = setTimeout(onTimeout, timeoutTime);
		}
	}

	dispose(): void {
		if (this.decorationIds) {
			this.editorModel.deltaDecorations(this.decorationIds, []);
			this.decorationIds = undefined;
		}
		if (typeof this.timeout === 'number') {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	compute(cancelationToken: CancellationToken): Promise<FoldingRegions> {
		const foldingRangeData: IFoldingRangeData[] = [];
		if (this.decorationIds) {
			for (const id of this.decorationIds) {
				const range = this.editorModel.getDecorationRange(id);
				if (range) {
					foldingRangeData.push({ start: range.startLineNumber, end: range.endLineNumber, rank: 1 });
				}
			}
		}
		return Promise.resolve(sanitizeRanges(foldingRangeData, Number.MAX_VALUE));
	}
}

