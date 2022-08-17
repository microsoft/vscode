/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { LineRange, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { TextModelProjection } from 'vs/workbench/contrib/mergeEditor/browser/model/textModelProjection';

export class ProjectedDiffComputer implements IDocumentDiffProvider {
	private readonly projectedTextModel = new Map<ITextModel, TextModelProjection>();

	constructor(
		private readonly underlyingDiffComputer: IDocumentDiffProvider,
		@IModelService private readonly modelService: IModelService,
	) {

	}

	async computeDiff(
		textModel1: ITextModel,
		textModel2: ITextModel,
		options: IDocumentDiffProviderOptions
	): Promise<IDocumentDiff> {
		let proj = this.projectedTextModel.get(textModel2);
		if (!proj) {
			proj = TextModelProjection.create(textModel2, {
				blockToRemoveStartLinePrefix: '<<<<<<<',
				blockToRemoveEndLinePrefix: '>>>>>>>',
			}, this.modelService);
			this.projectedTextModel.set(textModel2, proj);
		}

		const result = await this.underlyingDiffComputer.computeDiff(textModel1, proj.targetDocument, options);

		const transformer = proj.createMonotonousReverseTransformer();

		return {
			identical: result.identical,
			quitEarly: result.quitEarly,

			changes: result.changes.map(d => {
				const start = transformer.transform(new Position(d.modifiedRange.startLineNumber, 1)).lineNumber;

				const innerChanges = d.innerChanges?.map(m => {
					const start = transformer.transform(m.modifiedRange.getStartPosition());
					const end = transformer.transform(m.modifiedRange.getEndPosition());
					return new RangeMapping(m.originalRange, Range.fromPositions(start, end));
				});

				const end = transformer.transform(new Position(d.modifiedRange.endLineNumberExclusive, 1)).lineNumber;

				return new LineRangeMapping(
					d.originalRange,
					new LineRange(start, end),
					innerChanges
				);
			})
		};
	}
}
