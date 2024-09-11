/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { IUnchangedEditorRegionsService } from './unchangedEditorRegions.js';

export interface IDiffEditorHeightCalculatorService {
	diffAndComputeHeight(values: { original: URI; modified: URI }, options: { lineHeight: number }): Promise<number>;
	computeHeightFromLines(lineCount: number, options: { lineHeight: number }): number;
}

export class DiffEditorHeightCalculatorService {
	constructor(
		private readonly unchangedEitorRegionsService: IUnchangedEditorRegionsService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) { }

	public async diffAndComputeHeight(values: { original: URI; modified: URI }, options: { lineHeight: number }): Promise<number> {
		const originalUri = values.original;
		const modifiedUri = values.modified;

		if (this.unchangedEitorRegionsService.options.enabled) {
			return this.unchangedEitorRegionsService.computeEditorHeight(originalUri, modifiedUri);
		}

		const [originalModel, modifiedModel] = await Promise.all([this.textModelResolverService.createModelReference(originalUri), this.textModelResolverService.createModelReference(modifiedUri)]);
		try {
			const originalLineCount = originalModel.object.textEditorModel.getLineCount();
			const modifiedLineCount = modifiedModel.object.textEditorModel.getLineCount();
			return this.computeHeightFromLines(Math.max(originalLineCount, modifiedLineCount), options);
		} finally {
			originalModel.dispose();
			modifiedModel.dispose();
		}
	}

	public computeHeightFromLines(lineCount: number, options: {
		lineHeight: number;
	}): number {
		return lineCount * options.lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
	}
}
