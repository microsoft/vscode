/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { UnchangedRegion } from '../../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { HeightOfHiddenLinesRegionInDiffEditor } from './diffElementViewModel.js';

const HorizontalScrollbarHeight = 12;

export interface IDiffEditorHeightCalculatorService {
	diffAndComputeHeight(original: URI, modified: URI): Promise<number>;
	computeHeightFromLines(lineCount: number): number;
}

export class DiffEditorHeightCalculatorService {
	constructor(
		private readonly fontInfo: FontInfo,
		private readonly editorWidth: number | undefined,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) { }

	public async diffAndComputeHeight(original: URI, modified: URI): Promise<number> {
		const [originalModel, modifiedModel] = await Promise.all([this.textModelResolverService.createModelReference(original), this.textModelResolverService.createModelReference(modified)]);
		try {
			const diffChanges = await this.editorWorkerService.computeDiff(original, modified, {
				ignoreTrimWhitespace: true,
				maxComputationTimeMs: 0,
				computeMoves: false
			}, 'advanced').then(diff => diff?.changes || []);

			const unchangedRegionFeatureEnabled = this.configurationService.getValue<boolean>('diffEditor.hideUnchangedRegions.enabled');
			const minimumLineCount = this.configurationService.getValue<number>('diffEditor.hideUnchangedRegions.minimumLineCount');
			const contextLineCount = this.configurationService.getValue<number>('diffEditor.hideUnchangedRegions.contextLineCount');
			const originalLineCount = originalModel.object.textEditorModel.getLineCount();
			const modifiedLineCount = modifiedModel.object.textEditorModel.getLineCount();
			const unchanged = unchangedRegionFeatureEnabled ? UnchangedRegion.fromDiffs(diffChanges,
				originalLineCount,
				modifiedLineCount,
				minimumLineCount ?? 3,
				contextLineCount ?? 3) : [];

			const numberOfNewLines = diffChanges.reduce((prev, curr) => {
				if (curr.original.isEmpty && !curr.modified.isEmpty) {
					return prev + curr.modified.length;
				}
				if (!curr.original.isEmpty && !curr.modified.isEmpty && curr.modified.length > curr.original.length) {
					return prev + curr.modified.length - curr.original.length;
				}
				return prev;
			}, 0);
			const orginalNumberOfLines = originalModel.object.textEditorModel.getLineCount();
			const numberOfHiddenLines = unchanged.reduce((prev, curr) => prev + curr.lineCount, 0);
			const numberOfHiddenSections = unchanged.length;
			const unchangeRegionsHeight = numberOfHiddenSections * HeightOfHiddenLinesRegionInDiffEditor;
			const visibleLineCount = orginalNumberOfLines + numberOfNewLines - numberOfHiddenLines;
			const requiresScrollbar = this.requiresScrollbar(originalModel.object.textEditorModel, originalModel.object.getLanguageId()) || this.requiresScrollbar(modifiedModel.object.textEditorModel, modifiedModel.object.getLanguageId());
			const scrollbarHeight = requiresScrollbar ? HorizontalScrollbarHeight : 0;

			// TODO: When we have a horizontal scrollbar, we need to add 12 to the height.
			// Right now there's no way to determine if a horizontal scrollbar is visible in the editor.
			return (visibleLineCount * this.fontInfo.lineHeight) + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + unchangeRegionsHeight + scrollbarHeight;
		} finally {
			originalModel.dispose();
			modifiedModel.dispose();
		}
	}

	public computeHeightFromLines(lineCount: number): number {
		return lineCount * this.fontInfo.lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
	}

	private requiresScrollbar(textModel: ITextModel, language?: string) {
		if (!this.editorWidth) {
			return false;
		}
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language });
		if (editorOptions.wordWrap !== 'off') {
			return false;
		}

		for (let i = 0; i < textModel.getLineCount(); i++) {
			const max = textModel.getLineLastNonWhitespaceColumn(i + 1);
			const estimatedWidth = max * (this.fontInfo.typicalHalfwidthCharacterWidth + this.fontInfo.letterSpacing);
			if (estimatedWidth > this.editorWidth) {
				return true;
			}
		}

		return false;
	}

}
