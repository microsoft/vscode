/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { IUnchangedEditorRegionsService } from './unchangedEditorRegions.js';

export interface IDiffEditorHeightCalculatorService {
	diffAndComputeHeight(original: URI, modified: URI): Promise<number>;
	computeHeightFromLines(lineCount: number): number;
}

export class DiffEditorHeightCalculatorService {
	constructor(
		private readonly lineHeight: number,
		private readonly unchangedEitorRegionsService: IUnchangedEditorRegionsService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) { }

	public async diffAndComputeHeight(original: URI, modified: URI): Promise<number> {
		if (this.unchangedEitorRegionsService.options.enabled) {
			return this.unchangedEitorRegionsService.computeEditorHeight(original, modified);
		}

		const [originalModel, modifiedModel] = await Promise.all([this.textModelResolverService.createModelReference(original), this.textModelResolverService.createModelReference(modified)]);
		try {
			const originalLineCount = originalModel.object.textEditorModel.getLineCount();
			const modifiedLineCount = modifiedModel.object.textEditorModel.getLineCount();
			return this.computeHeightFromLines(Math.max(originalLineCount, modifiedLineCount));
		} finally {
			originalModel.dispose();
			modifiedModel.dispose();
		}
	}

	public computeHeightFromLines(lineCount: number): number {
		return lineCount * this.lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
	}
}
