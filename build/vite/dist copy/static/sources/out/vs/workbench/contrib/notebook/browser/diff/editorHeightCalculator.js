/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { UnchangedRegion } from '../../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { HeightOfHiddenLinesRegionInDiffEditor } from './diffElementViewModel.js';
let DiffEditorHeightCalculatorService = class DiffEditorHeightCalculatorService {
    constructor(lineHeight, textModelResolverService, editorWorkerService, configurationService) {
        this.lineHeight = lineHeight;
        this.textModelResolverService = textModelResolverService;
        this.editorWorkerService = editorWorkerService;
        this.configurationService = configurationService;
    }
    async diffAndComputeHeight(original, modified) {
        const [originalModel, modifiedModel] = await Promise.all([this.textModelResolverService.createModelReference(original), this.textModelResolverService.createModelReference(modified)]);
        try {
            const diffChanges = await this.editorWorkerService.computeDiff(original, modified, {
                ignoreTrimWhitespace: true,
                maxComputationTimeMs: 0,
                computeMoves: false
            }, 'advanced').then(diff => diff?.changes || []);
            const unchangedRegionFeatureEnabled = this.configurationService.getValue('diffEditor.hideUnchangedRegions.enabled');
            const minimumLineCount = this.configurationService.getValue('diffEditor.hideUnchangedRegions.minimumLineCount');
            const contextLineCount = this.configurationService.getValue('diffEditor.hideUnchangedRegions.contextLineCount');
            const originalLineCount = originalModel.object.textEditorModel.getLineCount();
            const modifiedLineCount = modifiedModel.object.textEditorModel.getLineCount();
            const unchanged = unchangedRegionFeatureEnabled ? UnchangedRegion.fromDiffs(diffChanges, originalLineCount, modifiedLineCount, minimumLineCount ?? 3, contextLineCount ?? 3) : [];
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
            // TODO: When we have a horizontal scrollbar, we need to add 12 to the height.
            // Right now there's no way to determine if a horizontal scrollbar is visible in the editor.
            return (visibleLineCount * this.lineHeight) + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + unchangeRegionsHeight;
        }
        finally {
            originalModel.dispose();
            modifiedModel.dispose();
        }
    }
    computeHeightFromLines(lineCount) {
        return lineCount * this.lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
    }
};
DiffEditorHeightCalculatorService = __decorate([
    __param(1, ITextModelService),
    __param(2, IEditorWorkerService),
    __param(3, IConfigurationService)
], DiffEditorHeightCalculatorService);
export { DiffEditorHeightCalculatorService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9lZGl0b3JIZWlnaHRDYWxjdWxhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM5RCxPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQU8zRSxJQUFNLGlDQUFpQyxHQUF2QyxNQUFNLGlDQUFpQztJQUM3QyxZQUNrQixVQUFrQixFQUNDLHdCQUEyQyxFQUN4QyxtQkFBeUMsRUFDeEMsb0JBQTJDO1FBSGxFLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDQyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQW1CO1FBQ3hDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDeEMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtJQUNoRixDQUFDO0lBRUUsS0FBSyxDQUFDLG9CQUFvQixDQUFDLFFBQWEsRUFBRSxRQUFhO1FBQzdELE1BQU0sQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksQ0FBQyx3QkFB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