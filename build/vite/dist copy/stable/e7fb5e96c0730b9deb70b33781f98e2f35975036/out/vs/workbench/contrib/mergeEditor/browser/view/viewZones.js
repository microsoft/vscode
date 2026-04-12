/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $ } from '../../../../../base/browser/dom.js';
import { CompareResult } from '../../../../../base/common/arrays.js';
import { MergeEditorLineRange } from '../model/lineRange.js';
import { join } from '../utils.js';
import { ActionsSource, ConflictActionsFactory } from './conflictActions.js';
import { getAlignments } from './lineAlignment.js';
export class ViewZoneComputer {
    constructor(input1Editor, input2Editor, resultEditor) {
        this.input1Editor = input1Editor;
        this.input2Editor = input2Editor;
        this.resultEditor = resultEditor;
        this.conflictActionsFactoryInput1 = new ConflictActionsFactory(this.input1Editor);
        this.conflictActionsFactoryInput2 = new ConflictActionsFactory(this.input2Editor);
        this.conflictActionsFactoryResult = new ConflictActionsFactory(this.resultEditor);
    }
    computeViewZones(reader, viewModel, options) {
        let input1LinesAdded = 0;
        let input2LinesAdded = 0;
        let baseLinesAdded = 0;
        let resultLinesAdded = 0;
        const input1ViewZones = [];
        const input2ViewZones = [];
        const baseViewZones = [];
        const resultViewZones = [];
        const model = viewModel.model;
        const resultDiffs = model.baseResultDiffs.read(reader);
        const baseRangeWithStoreAndTouchingDiffs = join(model.modifiedBaseRanges.read(reader), resultDiffs, (baseRange, diff) => baseRange.baseRange.intersectsOrTouches(diff.inputRange)
            ? CompareResult.neitherLessOrGreaterThan
            : MergeEditorLineRange.compareByStart(baseRange.baseRange, diff.inputRange));
        const shouldShowCodeLenses = options.codeLensesVisible;
        const showNonConflictingChanges = options.showNonConflictingChanges;
        let lastModifiedBaseRange = undefined;
        let lastBaseResultDiff = undefined;
        for (const m of baseRangeWithStoreAndTouchingDiffs) {
            if (shouldShowCodeLenses && m.left && (m.left.isConflicting || showNonConflictingChanges || !model.isHandled(m.left).read(reader))) {
                const actions = new ActionsSource(viewModel, m.left);
                if (options.shouldAlignResult || !actions.inputIsEmpty.read(reader)) {
                    input1ViewZones.push(new CommandViewZone(this.conflictActionsFactoryInput1, m.left.input1Range.startLineNumber - 1, actions.itemsInput1));
                    input2ViewZones.push(new CommandViewZone(this.conflictActionsFactoryInput2, m.left.input2Range.startLineNumber - 1, actions.itemsInput2));
                    if (options.shouldAlignBase) {
                        baseViewZones.push(new Placeholder(m.left.baseRange.startLineNumber - 1, 16));
                    }
                }
                const afterLineNumber = m.left.baseRange.startLineNumber + (lastBaseResultDiff?.resultingDeltaFromOriginalToModified ?? 0) - 1;
                resultViewZones.push(new CommandViewZone(this.conflictActionsFactoryResult, afterLineNumber, actions.resultItems));
            }
            const lastResultDiff = m.rights.at(-1);
            if (lastResultDiff) {
                lastBaseResultDiff = lastResultDiff;
            }
            let alignedLines;
            if (m.left) {
                alignedLines = getAlignments(m.left).map(a => ({
                    input1Line: a[0],
                    baseLine: a[1],
                    input2Line: a[2],
                    resultLine: undefined,
                }));
                lastModifiedBaseRange = m.left;
                // This is a total hack.
                alignedLines[alignedLines.length - 1].resultLine =
                    m.left.baseRange.endLineNumberExclusive
                        + (lastBaseResultDiff ? lastBaseResultDiff.resultingDeltaFromOriginalToModified : 0);
            }
            else {
                alignedLines = [{
                        baseLine: lastResultDiff.inputRange.endLineNumberExclusive,
                        input1Line: lastResultDiff.inputRange.endLineNumberExclusive + (lastModifiedBaseRange ? (lastModifiedBaseRange.input1Range.endLineNumberExclusive - lastModifiedBaseRange.baseRange.endLineNumberExclusive) : 0),
                        input2Line: lastResultDiff.inputRange.endLineNumberExclusive + (lastModifiedBaseRange ? (lastModifiedBaseRange.input2Range.endLineNumberExclusive - lastModifiedBaseRange.baseRange.endLineNumberExclusive) : 0),
                        resultLine: lastResultDiff.outputRange.endLineNumberExclusive,
                    }];
            }
            for (const { input1Line, baseLine, input2Line, resultLine } of alignedLines) {
                if (!options.shouldAlignBase && (input1Line === undefined || input2Line === undefined)) {
                    continue;
                }
                const input1Line_ = input1Line !== undefined ? input1Line + input1LinesAdded : -1;
                const input2Line_ = input2Line !== undefined ? input2Line + input2LinesAdded : -1;
                const baseLine_ = baseLine + baseLinesAdded;
                const resultLine_ = resultLine !== undefined ? resultLine + resultLinesAdded : -1;
                const max = Math.max(options.shouldAlignBase ? baseLine_ : 0, input1Line_, input2Line_, options.shouldAlignResult ? resultLine_ : 0);
                if (input1Line !== undefined) {
                    const diffInput1 = max - input1Line_;
                    if (diffInput1 > 0) {
                        input1ViewZones.push(new Spacer(input1Line - 1, diffInput1));
                        input1LinesAdded += diffInput1;
                    }
                }
                if (input2Line !== undefined) {
                    const diffInput2 = max - input2Line_;
                    if (diffInput2 > 0) {
                        input2ViewZones.push(new Spacer(input2Line - 1, diffInput2));
                        input2LinesAdded += diffInput2;
                    }
                }
                if (options.shouldAlignBase) {
                    const diffBase = max - baseLine_;
                    if (diffBase > 0) {
                        baseViewZones.push(new Spacer(baseLine - 1, diffBase));
                        baseLinesAdded += diffBase;
                    }
                }
                if (options.shouldAlignResult && resultLine !== undefined) {
                    const diffResult = max - resultLine_;
                    if (diffResult > 0) {
                        resultViewZones.push(new Spacer(resultLine - 1, diffResult));
                        resultLinesAdded += diffResult;
                    }
                }
            }
        }
        return new MergeEditorViewZones(input1ViewZones, input2ViewZones, baseViewZones, resultViewZones);
    }
}
export class MergeEditorViewZones {
    constructor(input1ViewZones, input2ViewZones, baseViewZones, resultViewZones) {
        this.input1ViewZones = input1ViewZones;
        this.input2ViewZones = input2ViewZones;
        this.baseViewZones = baseViewZones;
        this.resultViewZones = resultViewZones;
    }
}
/**
 * This is an abstract class to create various editor view zones.
*/
export class MergeEditorViewZone {
}
class Spacer extends MergeEditorViewZone {
    constructor(afterLineNumber, heightInLines) {
        super();
        this.afterLineNumber = afterLineNumber;
        this.heightInLines = heightInLines;
    }
    create(viewZoneChangeAccessor, viewZoneIdsToCleanUp, disposableStore) {
        viewZoneIdsToCleanUp.push(viewZoneChangeAccessor.addZone({
            afterLineNumber: this.afterLineNumber,
            heightInLines: this.heightInLines,
            domNode: $('div.diagonal-fill'),
        }));
    }
}
class Placeholder extends MergeEditorViewZone {
    constructor(afterLineNumber, heightPx) {
        super();
        this.afterLineNumber = afterLineNumber;
        this.heightPx = heightPx;
    }
    create(viewZoneChangeAccessor, viewZoneIdsToCleanUp, disposableStore) {
        viewZoneIdsToCleanUp.push(viewZoneChangeAccessor.addZone({
            afterLineNumber: this.afterLineNumber,
            heightInPx: this.heightPx,
            domNode: $('div.conflict-actions-placeholder'),
        }));
    }
}
class CommandViewZone extends MergeEditorViewZone {
    constructor(conflictActionsFactory, lineNumber, items) {
        super();
        this.conflictActionsFactory = conflictActionsFactory;
        this.lineNumber = lineNumber;
        this.items = items;
    }
    create(viewZoneChangeAccessor, viewZoneIdsToCleanUp, disposableStore) {
        disposableStore.add(this.conflictActionsFactory.createWidget(viewZoneChangeAccessor, this.lineNumber, this.items, viewZoneIdsToCleanUp));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1pvbmVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci92aWV3L3ZpZXdab25lcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBSXJFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRzdELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDbkMsT0FBTyxFQUFFLGFBQWEsRUFBRSxzQkFBc0IsRUFBd0IsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHbkQsTUFBTSxPQUFPLGdCQUFnQjtJQUs1QixZQUNrQixZQUF5QixFQUN6QixZQUF5QixFQUN6QixZQUF5QjtRQUZ6QixpQkFBWSxHQUFaLFlBQVksQ0FBYTtRQUN6QixpQkFBWSxHQUFaLFlBQVksQ0FBYTtRQUN6QixpQkFBWSxHQUFaLFlBQVksQ0FBYTtRQUUxQyxJQUFJLENBQUMsNEJBQTRCLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLDRCQUE0QixHQUFHLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2xGLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLHNCQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRU0sZ0JBQWdCLENBQ3RCLE1BQWUsRUFDZixTQUErQixFQUMvQixPQUtDO1FBRUQsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7UUFDekIsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7UUFDekIsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO1FBRXpCLE1BQU0sZUFBZSxHQUEwQixFQUFFLENBQUM7UUFDbEQsTUFBTSxlQUFlLEdBQTBCLEVBQUUsQ0FBQztRQUNsRCxNQUFNLGFBQWEsR0FBMEIsRUFBRSxDQUFDO1FBQ2hELE1BQU0sZUFBZSxHQUEwQixFQUFFLENBQUM7UUFFbEQsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQztRQUU5QixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxNQUFNLGtDQUFrQyxHQUFHLElBQUksQ0FDOUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFDckMsV0FBVyxFQUNYLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLENBQ25CLFNBQVMsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUN2RCxDQUFDLENBQUMsYUFBYSxDQUFDLHdCQUF3QjtZQUN4QyxDQUFDLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUNwQyxTQUFTLENBQUMsU0FBUyxFQUNuQixJQUFJLENBQUMsVUFBVSxDQUNmLENBQ0gsQ0FBQztRQUVGLE1BQU0sb0JBQW9CLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDO1FBQ3ZELE1BQU0seUJBQXlCLEdBQUcsT0FBTyxDQUFDLHlCQUF5QixDQUFDO1FBRXBFLElBQUkscUJBQXFCLEdBQWtDLFNBQVMsQ0FBQztRQUNyRSxJQUFJLGtCQUFrQixHQUF5QyxTQUFTLENBQUM7UUFDekUsS0FBSyxNQUFNLENBQUMsSUFBSSxrQ0FBa0MsRUFBRSxDQUFDO1lBQ3BELElBQUksb0JBQW9CLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFJLHlCQUF5QixJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDcEksTUFBTSxPQUFPLEdBQUcsSUFBSSxhQUFhLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDckQsSUFBSSxPQUFPLENBQUMsaUJBQWlCLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUNyRSxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUMxSSxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUMxSSxJQUFJLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDN0IsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQy9FLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxNQUFNLGVBQWUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxvQ0FBb0MsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQy9ILGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUVwSCxDQUFDO1lBRUQsTUFBTSxjQUFjLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztZQUN4QyxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixrQkFBa0IsR0FBRyxjQUFjLENBQUM7WUFDckMsQ0FBQztZQUNELElBQUksWUFBNkIsQ0FBQztZQUNsQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWixZQUFZLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM5QyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDaEIsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2QsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLFVBQVUsRUFBRSxTQUFTO2lCQUNyQixDQUFDLENBQUMsQ0FBQztnQkFFSixxQkFBcUIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMvQix3QkFBd0I7Z0JBQ3hCLFlBQVksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLFVBQVU7b0JBQy9DLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLHNCQUFzQjswQkFDckMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXZGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxZQUFZLEdBQUcsQ0FBQzt3QkFDZixRQUFRLEVBQUUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxzQkFBc0I7d0JBQzFELFVBQVUsRUFBRSxjQUFjLENBQUMsVUFBVSxDQUFDLHNCQUFzQixHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2hOLFVBQVUsRUFBRSxjQUFjLENBQUMsVUFBVSxDQUFDLHNCQUFzQixHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2hOLFVBQVUsRUFBRSxjQUFjLENBQUMsV0FBVyxDQUFDLHNCQUFzQjtxQkFDN0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUVELEtBQUssTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUM3RSxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLElBQUksVUFBVSxLQUFLLFNBQVMsQ0FBQyxFQUFFLENBQUM7b0JBQ3hGLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxNQUFNLFdBQVcsR0FDaEIsVUFBVSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxXQUFXLEdBQ2hCLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9ELE1BQU0sU0FBUyxHQUFHLFFBQVEsR0FBRyxjQUFjLENBQUM7Z0JBQzVDLE1BQU0sV0FBVyxHQUFHLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRWxGLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXJJLElBQUksVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUM5QixNQUFNLFVBQVUsR0FBRyxHQUFHLEdBQUcsV0FBVyxDQUFDO29CQUNyQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDcEIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQzdELGdCQUFnQixJQUFJLFVBQVUsQ0FBQztvQkFDaEMsQ0FBQztnQkFDRixDQUFDO2dCQUVELElBQUksVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUM5QixNQUFNLFVBQVUsR0FBRyxHQUFHLEdBQUcsV0FBVyxDQUFDO29CQUNyQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDcEIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQzdELGdCQUFnQixJQUFJLFVBQVUsQ0FBQztvQkFDaEMsQ0FBQztnQkFDRixDQUFDO2dCQUVELElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUM3QixNQUFNLFFBQVEsR0FBRyxHQUFHLEdBQUcsU0FBUyxDQUFDO29CQUNqQyxJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDbEIsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZELGNBQWMsSUFBSSxRQUFRLENBQUM7b0JBQzVCLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsSUFBSSxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQzNELE1BQU0sVUFBVSxHQUFHLEdBQUcsR0FBRyxXQUFXLENBQUM7b0JBQ3JDLElBQUksVUFBVSxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUNwQixlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDN0QsZ0JBQWdCLElBQUksVUFBVSxDQUFDO29CQUNoQyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNuRyxDQUFDO0NBQ0Q7QUFTRCxNQUFNLE9BQU8sb0JBQW9CO0lBQ2hDLFlBQ2lCLGVBQStDLEVBQy9DLGVBQStDLEVBQy9DLGFBQTZDLEVBQzdDLGVBQStDO1FBSC9DLG9CQUFlLEdBQWYsZUFBZSxDQUFnQztRQUMvQyxvQkFBZSxHQUFmLGVBQWUsQ0FBZ0M7UUFDL0Msa0JBQWEsR0FBYixhQUFhLENBQWdDO1FBQzdDLG9CQUFlLEdBQWYsZUFBZSxDQUFnQztJQUM1RCxDQUFDO0NBQ0w7QUFFRDs7RUFFRTtBQUNGLE1BQU0sT0FBZ0IsbUJBQW1CO0NBRXhDO0FBRUQsTUFBTSxNQUFPLFNBQVEsbUJBQW1CO0lBQ3ZDLFlBQ2tCLGVBQXVCLEVBQ3ZCLGFBQXFCO1FBRXRDLEtBQUssRUFBRSxDQUFDO1FBSFMsb0JBQWUsR0FBZixlQUFlLENBQVE7UUFDdkIsa0JBQWEsR0FBYixhQUFhLENBQVE7SUFHdkMsQ0FBQztJQUVRLE1BQU0sQ0FDZCxzQkFBK0MsRUFDL0Msb0JBQThCLEVBQzlCLGVBQWdDO1FBRWhDLG9CQUFvQixDQUFDLElBQUksQ0FDeEIsc0JBQXNCLENBQUMsT0FBTyxDQUFDO1lBQzlCLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUNyQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDakMsT0FBTyxFQUFFLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQztTQUMvQixDQUFDLENBQ0YsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELE1BQU0sV0FBWSxTQUFRLG1CQUFtQjtJQUM1QyxZQUNrQixlQUF1QixFQUN2QixRQUFnQjtRQUVqQyxLQUFLLEVBQUUsQ0FBQztRQUhTLG9CQUFlLEdBQWYsZUFBZSxDQUFRO1FBQ3ZCLGFBQVEsR0FBUixRQUFRLENBQVE7SUFHbEMsQ0FBQztJQUVRLE1BQU0sQ0FDZCxzQkFBK0MsRUFDL0Msb0JBQThCLEVBQzlCLGVBQWdDO1FBRWhDLG9CQUFvQixDQUFDLElBQUksQ0FDeEIsc0JBQXNCLENBQUMsT0FBTyxDQUFDO1lBQzlCLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUNyQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDekIsT0FBTyxFQUFFLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQztTQUM5QyxDQUFDLENBQ0YsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELE1BQU0sZUFBZ0IsU0FBUSxtQkFBbUI7SUFDaEQsWUFDa0Isc0JBQThDLEVBQzlDLFVBQWtCLEVBQ2xCLEtBQTBDO1FBRTNELEtBQUssRUFBRSxDQUFDO1FBSlMsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF3QjtRQUM5QyxlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2xCLFVBQUssR0FBTCxLQUFLLENBQXFDO0lBRzVELENBQUM7SUFFUSxNQUFNLENBQUMsc0JBQStDLEVBQUUsb0JBQThCLEVBQUUsZUFBZ0M7UUFDaEksZUFBZSxDQUFDLEdBQUcsQ0FDbEIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FDdkMsc0JBQXNCLEVBQ3RCLElBQUksQ0FBQyxVQUFVLEVBQ2YsSUFBSSxDQUFDLEtBQUssRUFDVixvQkFBb0IsQ0FDcEIsQ0FDRCxDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=