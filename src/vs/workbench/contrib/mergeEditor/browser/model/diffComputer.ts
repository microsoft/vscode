/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
import { IReader } from '../../../../../base/common/observable.js';
import { RangeMapping as DiffRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { LineRange } from './lineRange.js';
import { DetailedLineRangeMapping, RangeMapping } from './mapping.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { LineRange as DiffLineRange } from '../../../../../editor/common/core/lineRange.js';

export interface IMergeDiffComputer {
	computeDiff(textModel1: ITextModel, textModel2: ITextModel, reader: IReader): Promise<IMergeDiffComputerResult>;
}

export interface IMergeDiffComputerResult {
	diffs: DetailedLineRangeMapping[] | null;
}

export class MergeDiffComputer implements IMergeDiffComputer {
	private readonly mergeAlgorithm = observableConfigValue<'smart' | 'experimental' | 'legacy' | 'advanced'>(
		'mergeEditor.diffAlgorithm', 'advanced', this.configurationService)
		.map(v => v === 'smart' ? 'legacy' : v === 'experimental' ? 'advanced' : v);

	constructor(
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel, reader: IReader): Promise<IMergeDiffComputerResult> {
		const diffAlgorithm = this.mergeAlgorithm.read(reader);
		const inputVersion = textModel1.getVersionId();
		const outputVersion = textModel2.getVersionId();

		const result = await this.editorWorkerService.computeDiff(
			textModel1.uri,
			textModel2.uri,
			{
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: 0,
				computeMoves: false,
			},
			diffAlgorithm,
		);

		if (!result) {
			throw new Error('Diff computation failed');
		}

		if (textModel1.isDisposed() || textModel2.isDisposed()) {
			return { diffs: null };
		}

		const changes = result.changes.map(c =>
			new DetailedLineRangeMapping(
				toLineRange(c.original),
				textModel1,
				toLineRange(c.modified),
				textModel2,
				c.innerChanges?.map(ic => toRangeMapping(ic))
			)
		);

		const newInputVersion = textModel1.getVersionId();
		const newOutputVersion = textModel2.getVersionId();

		if (inputVersion !== newInputVersion || outputVersion !== newOutputVersion) {
			return { diffs: null };
		}

		assertFn(() => {
			for (const c of changes) {
				const inputRange = c.inputRange;
				const outputRange = c.outputRange;
				const inputTextModel = c.inputTextModel;
				const outputTextModel = c.outputTextModel;

				for (const map of c.rangeMappings) {
					let inputRangesValid = inputRange.startLineNumber - 1 <= map.inputRange.startLineNumber
						&& map.inputRange.endLineNumber <= inputRange.endLineNumberExclusive;
					if (inputRangesValid && map.inputRange.startLineNumber === inputRange.startLineNumber - 1) {
						inputRangesValid = map.inputRange.endColumn >= inputTextModel.getLineMaxColumn(map.inputRange.startLineNumber);
					}
					if (inputRangesValid && map.inputRange.endLineNumber === inputRange.endLineNumberExclusive) {
						inputRangesValid = map.inputRange.endColumn === 1;
					}

					let outputRangesValid = outputRange.startLineNumber - 1 <= map.outputRange.startLineNumber
						&& map.outputRange.endLineNumber <= outputRange.endLineNumberExclusive;
					if (outputRangesValid && map.outputRange.startLineNumber === outputRange.startLineNumber - 1) {
						outputRangesValid = map.outputRange.endColumn >= outputTextModel.getLineMaxColumn(map.outputRange.endLineNumber);
					}
					if (outputRangesValid && map.outputRange.endLineNumber === outputRange.endLineNumberExclusive) {
						outputRangesValid = map.outputRange.endColumn === 1;
					}

					if (!inputRangesValid || !outputRangesValid) {
						return false;
					}
				}
			}

			return changes.length === 0 || (changes[0].inputRange.startLineNumber === changes[0].outputRange.startLineNumber &&
				checkAdjacentItems(changes,
					(m1, m2) => m2.inputRange.startLineNumber - m1.inputRange.endLineNumberExclusive === m2.outputRange.startLineNumber - m1.outputRange.endLineNumberExclusive &&
						// There has to be an unchanged line in between (otherwise both diffs should have been joined)
						m1.inputRange.endLineNumberExclusive < m2.inputRange.startLineNumber &&
						m1.outputRange.endLineNumberExclusive < m2.outputRange.startLineNumber,
				));
		});

		return {
			diffs: changes
		};
	}
}

export function toLineRange(range: DiffLineRange): LineRange {
	return new LineRange(range.startLineNumber, range.length);
}

export function toRangeMapping(mapping: DiffRangeMapping): RangeMapping {
	return new RangeMapping(mapping.originalRange, mapping.modifiedRange);
}
