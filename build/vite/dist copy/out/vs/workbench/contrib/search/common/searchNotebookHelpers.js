/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextSearchMatch } from '../../../services/search/common/search.js';
import { Range } from '../../../../editor/common/core/range.js';
export function isINotebookFileMatchNoModel(object) {
    return 'cellResults' in object;
}
export const rawCellPrefix = 'rawCell#';
export function genericCellMatchesToTextSearchMatches(contentMatches, buffer) {
    let previousEndLine = -1;
    const contextGroupings = [];
    let currentContextGrouping = [];
    contentMatches.forEach((match) => {
        if (match.range.startLineNumber !== previousEndLine) {
            if (currentContextGrouping.length > 0) {
                contextGroupings.push([...currentContextGrouping]);
                currentContextGrouping = [];
            }
        }
        currentContextGrouping.push(match);
        previousEndLine = match.range.endLineNumber;
    });
    if (currentContextGrouping.length > 0) {
        contextGroupings.push([...currentContextGrouping]);
    }
    const textSearchResults = contextGroupings.map((grouping) => {
        const lineTexts = [];
        const firstLine = grouping[0].range.startLineNumber;
        const lastLine = grouping[grouping.length - 1].range.endLineNumber;
        for (let i = firstLine; i <= lastLine; i++) {
            lineTexts.push(buffer.getLineContent(i));
        }
        return new TextSearchMatch(lineTexts.join('\n') + '\n', grouping.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)));
    });
    return textSearchResults;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoTm90ZWJvb2tIZWxwZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2hOb3RlYm9va0hlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBZ0MsTUFBTSwyQ0FBMkMsQ0FBQztBQUMxRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFlaEUsTUFBTSxVQUFVLDJCQUEyQixDQUFDLE1BQWtCO0lBQzdELE9BQU8sYUFBYSxJQUFJLE1BQU0sQ0FBQztBQUNoQyxDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQztBQUV4QyxNQUFNLFVBQVUscUNBQXFDLENBQUMsY0FBMkIsRUFBRSxNQUEyQjtJQUM3RyxJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN6QixNQUFNLGdCQUFnQixHQUFrQixFQUFFLENBQUM7SUFDM0MsSUFBSSxzQkFBc0IsR0FBZ0IsRUFBRSxDQUFDO0lBRTdDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtRQUNoQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsZUFBZSxLQUFLLGVBQWUsRUFBRSxDQUFDO1lBQ3JELElBQUksc0JBQXNCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDbkQsc0JBQXNCLEdBQUcsRUFBRSxDQUFDO1lBQzdCLENBQUM7UUFDRixDQUFDO1FBRUQsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25DLGVBQWUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQztJQUM3QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksc0JBQXNCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3ZDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFRCxNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO1FBQzNELE1BQU0sU0FBUyxHQUFhLEVBQUUsQ0FBQztRQUMvQixNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQztRQUNwRCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDO1FBQ25FLEtBQUssSUFBSSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsSUFBSSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM1QyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLGVBQWUsQ0FDekIsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLEVBQzNCLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUNwSSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLGlCQUFpQixDQUFDO0FBQzFCLENBQUMifQ==