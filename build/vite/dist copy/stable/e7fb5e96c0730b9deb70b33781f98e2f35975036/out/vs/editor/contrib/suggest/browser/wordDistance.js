/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { binarySearch, isFalsyOrEmpty } from '../../../../base/common/arrays.js';
import { Range } from '../../../common/core/range.js';
import { BracketSelectionRangeProvider } from '../../smartSelect/browser/bracketSelections.js';
export class WordDistance {
    static { this.None = new class extends WordDistance {
        distance() { return 0; }
    }; }
    static async create(service, editor) {
        if (!editor.getOption(134 /* EditorOption.suggest */).localityBonus) {
            return WordDistance.None;
        }
        if (!editor.hasModel()) {
            return WordDistance.None;
        }
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!service.canComputeWordRanges(model.uri)) {
            return WordDistance.None;
        }
        const [ranges] = await new BracketSelectionRangeProvider().provideSelectionRanges(model, [position]);
        if (ranges.length === 0) {
            return WordDistance.None;
        }
        const wordRanges = await service.computeWordRanges(model.uri, ranges[0].range);
        if (!wordRanges) {
            return WordDistance.None;
        }
        // remove current word
        const wordUntilPos = model.getWordUntilPosition(position);
        delete wordRanges[wordUntilPos.word];
        return new class extends WordDistance {
            distance(anchor, item) {
                if (!position.equals(editor.getPosition())) {
                    return 0;
                }
                if (item.kind === 17 /* CompletionItemKind.Keyword */) {
                    return 2 << 20;
                }
                const word = typeof item.label === 'string' ? item.label : item.label.label;
                const wordLines = wordRanges[word];
                if (isFalsyOrEmpty(wordLines)) {
                    return 2 << 20;
                }
                const idx = binarySearch(wordLines, Range.fromPositions(anchor), Range.compareRangesUsingStarts);
                const bestWordRange = idx >= 0 ? wordLines[idx] : wordLines[Math.max(0, ~idx - 1)];
                let blockDistance = ranges.length;
                for (const range of ranges) {
                    if (!Range.containsRange(range.range, bestWordRange)) {
                        break;
                    }
                    blockDistance -= 1;
                }
                return blockDistance;
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZERpc3RhbmNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3dvcmREaXN0YW5jZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSWpGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUd0RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRixNQUFNLE9BQWdCLFlBQVk7YUFFakIsU0FBSSxHQUFHLElBQUksS0FBTSxTQUFRLFlBQVk7UUFDcEQsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN4QixDQUFDO0lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBNkIsRUFBRSxNQUFtQjtRQUVyRSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsZ0NBQXNCLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0QsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDO1FBQzFCLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDeEIsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDO1FBQzFCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUMsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDO1FBQzFCLENBQUM7UUFFRCxNQUFNLENBQUMs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