/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextSearchMatch } from '../../../../services/search/common/search.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { genericCellMatchesToTextSearchMatches, rawCellPrefix } from '../../common/searchNotebookHelpers.js';
export function getIDFromINotebookCellMatch(match) {
    if (isINotebookCellMatchWithModel(match)) {
        return match.cell.id;
    }
    else {
        return `${rawCellPrefix}${match.index}`;
    }
}
export function isINotebookFileMatchWithModel(object) {
    return 'cellResults' in object && object.cellResults instanceof Array && object.cellResults.every(isINotebookCellMatchWithModel);
}
export function isINotebookCellMatchWithModel(object) {
    return 'cell' in object;
}
export function contentMatchesToTextSearchMatches(contentMatches, cell) {
    return genericCellMatchesToTextSearchMatches(contentMatches, cell.textBuffer);
}
export function webviewMatchesToTextSearchMatches(webviewMatches) {
    return webviewMatches
        .map(rawMatch => (rawMatch.searchPreviewInfo) ?
        new TextSearchMatch(rawMatch.searchPreviewInfo.line, new Range(0, rawMatch.searchPreviewInfo.range.start, 0, rawMatch.searchPreviewInfo.range.end), undefined, rawMatch.index) : undefined).filter((e) => !!e);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoTm90ZWJvb2tIZWxwZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvbm90ZWJvb2tTZWFyY2gvc2VhcmNoTm90ZWJvb2tIZWxwZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBZ0MsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDN0csT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBd0QscUNBQXFDLEVBQUUsYUFBYSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFPbkssTUFBTSxVQUFVLDJCQUEyQixDQUFDLEtBQXlCO0lBQ3BFLElBQUksNkJBQTZCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3RCLENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxHQUFHLGFBQWEsR0FBRyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDekMsQ0FBQztBQUNGLENBQUM7QUFTRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsTUFBVztJQUN4RCxPQUFPLGFBQWEsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLFdBQVcsWUFBWSxLQUFLLElBQUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUNsSSxDQUFDO0FBRUQsTUFBTSxVQUFVLDZCQUE2QixDQUFDLE1BQVc7SUFDeEQsT0FBTyxNQUFNLElBQUksTUFBTSxDQUFDO0FBQ3pCLENBQUM7QUFFRCxNQUFNLFVBQVUsaUNBQWlDLENBQUMsY0FBMkIsRUFBRSxJQUFvQjtJQUNsRyxPQUFPLHFDQUFxQyxDQUMzQyxjQUFjLEVBQ2QsSUFBSSxDQUFDLFVBQVUsQ0FDZixDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxpQ0FBaUMsQ0FBQyxjQUFzQztJQUN2RixPQUFPLGNBQWM7U0FDbkIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQ2YsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQzdCLElBQUksZUFBZSxDQUNsQixRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUMvQixJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQzdGLFNBQVMsRUFDVCxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FDN0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0MsQ0FBQyJ9