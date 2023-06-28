/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { IReader } from 'vs/base/common/observable';
import { RangeMapping as DiffRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { observableConfigValue } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { LineRange as DiffLineRange } from 'vs/editor/common/core/lineRange';

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
				toLineRange(c.originalRange),
				textModel1,
				toLineRange(c.modifiedRange),
				textModel2,
				c.innerChanges?.map(ic => toRangeMapping(ic))
			)
		);

		assertFn(() => {
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
