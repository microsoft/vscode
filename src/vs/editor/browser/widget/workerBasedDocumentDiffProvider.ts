/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineRange, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { Range } from 'vs/editor/common/core/range';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ITextModel } from 'vs/editor/common/model';

export class WorkerBasedDocumentDiffProvider implements IDocumentDiffProvider {
	constructor(
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
	) {
	}

	async computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
		const result = await this.editorWorkerService.computeDiff(original.uri, modified.uri, options);
		if (!result) {
			throw new Error('no diff result available');
		}

		// Convert from space efficient JSON data to rich objects.
		const diff: IDocumentDiff = {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: result.changes.map(
				(c) =>
					new LineRangeMapping(
						new LineRange(c[0], c[1]),
						new LineRange(c[2], c[3]),
						c[4]?.map(
							(c) =>
								new RangeMapping(
									new Range(c[0], c[1], c[2], c[3]),
									new Range(c[4], c[5], c[6], c[7])
								)
						)
					)
			),
		};
		return diff;
	}
}
