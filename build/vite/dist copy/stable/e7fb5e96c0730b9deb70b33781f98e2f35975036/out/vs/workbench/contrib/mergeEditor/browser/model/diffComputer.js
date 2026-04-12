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
import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { MergeEditorLineRange } from './lineRange.js';
import { DetailedLineRangeMapping, RangeMapping } from './mapping.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
let MergeDiffComputer = class MergeDiffComputer {
    constructor(editorWorkerService, configurationService) {
        this.editorWorkerService = editorWorkerService;
        this.configurationService = configurationService;
        this.mergeAlgorithm = observableConfigValue('mergeEditor.diffAlgorithm', 'advanced', this.configurationService)
            .map(v => v === 'smart' ? 'legacy' : v === 'experimental' ? 'advanced' : v);
    }
    async computeDiff(textModel1, textModel2, reader) {
        const diffAlgorithm = this.mergeAlgorithm.read(reader);
        const inputVersion = textModel1.getVersionId();
        const outputVersion = textModel2.getVersionId();
        const result = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, {
            ignoreTrimWhitespace: false,
            maxComputationTimeMs: 0,
            computeMoves: false,
        }, diffAlgorithm);
        if (!result) {
            throw new Error('Diff computation failed');
        }
        if (textModel1.isDisposed() || textModel2.isDisposed()) {
            return { diffs: null };
        }
        const changes = result.changes.map(c => new DetailedLineRangeMapping(toLineRange(c.original), textModel1, toLineRange(c.modified), textModel2, c.innerChanges?.map(ic => toRangeMapping(ic))));
        const newInputVersion = textModel1.getVersionId();
        const newOutputVersion = textModel2.getVersionId();
        if (inputVersion !== newInputVersion || outputVersion !== newOutputVersion) {
            return { diffs: null };
        }
        assertFn(() => {
            /*
            // This does not hold (see https://github.com/microsoft/vscode-copilot/issues/10610)
            // TODO@hediet the diff algorithm should just use compute a string edit that transforms the input to the output, nothing else

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
            }*/
            return changes.length === 0 || (changes[0].inputRange.startLineNumber === changes[0].outputRange.startLineNumber &&
                checkAdjacentItems(changes, (m1, m2) => m2.inputRange.startLineNumber - m1.inputRange.endLineNumberExclusive === m2.outputRange.startLineNumber - m1.outputRange.endLineNumberExclusive &&
                    // There has to be an unchanged line in between (otherwise both diffs should have been joined)
                    m1.inputRange.endLineNumberExclusive < m2.inputRange.startLineNumber &&
                    m1.outputRange.endLineNumberExclusive < m2.outputRange.startLineNumber));
        });
        return {
            diffs: changes
        };
    }
};
MergeDiffComputer = __decorate([
    __param(0, IEditorWorkerService),
    __param(1, IConfigurationService)
], MergeDiffComputer);
export { MergeDiffComputer };
export function toLineRange(range) {
    return MergeEditorLineRange.fromLength(range.startLineNumber, range.length);
}
export function toRangeMapping(mapping) {
    return new RangeMapping(mapping.originalRange, mapping.modifiedRange);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkNvbXB1dGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tb2RlbC9kaWZmQ29tcHV0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBSXBGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3RELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDdEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFXdEcsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBaUI7SUFHN0IsWUFDd0MsbUJBQXlDLEVBQ3hDLG9CQUEyQztRQUQ1Qyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQ3hDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFFbkYsSUFBSSxDQUFDLGNBQWMsR0FBRyxxQkFBcUIsQ0FDMUMsMkJBQTJCLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQzthQUNsRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFX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