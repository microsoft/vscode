/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { Range } from 'vs/editor/common/core/range';
import { IModelService } from 'vs/editor/common/services/model';
import { assertType } from 'vs/base/common/types';
import { DiffAlgorithmName, IEditorWorkerService, ILineChange } from 'vs/editor/common/services/editorWorker';
import { IDocumentDiff, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { BaseEditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { MovedText } from 'vs/editor/common/diff/linesDiffComputer';
import { LineRangeMapping, DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { TextEdit } from 'vs/editor/common/languages';


export class TestWorkerService extends mock<IEditorWorkerService>() {

	private readonly _worker = new BaseEditorSimpleWorker();

	constructor(@IModelService private readonly _modelService: IModelService) {
		super();
	}

	override async computeMoreMinimalEdits(resource: URI, edits: TextEdit[] | null | undefined, pretty?: boolean | undefined): Promise<TextEdit[] | undefined> {
		return undefined;
	}

	override async computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {

		const originalModel = this._modelService.getModel(original);
		const modifiedModel = this._modelService.getModel(modified);

		assertType(originalModel);
		assertType(modifiedModel);

		this._worker.$acceptNewModel({
			url: originalModel.uri.toString(),
			versionId: originalModel.getVersionId(),
			lines: originalModel.getLinesContent(),
			EOL: originalModel.getEOL(),
		});

		this._worker.$acceptNewModel({
			url: modifiedModel.uri.toString(),
			versionId: modifiedModel.getVersionId(),
			lines: modifiedModel.getLinesContent(),
			EOL: modifiedModel.getEOL(),
		});

		const result = await this._worker.$computeDiff(originalModel.uri.toString(), modifiedModel.uri.toString(), options, algorithm);
		if (!result) {
			return result;
		}
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

		function toLineRangeMappings(changes: readonly ILineChange[]): readonly DetailedLineRangeMapping[] {
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
	}
}
