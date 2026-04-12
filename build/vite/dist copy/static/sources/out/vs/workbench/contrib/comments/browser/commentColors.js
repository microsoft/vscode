/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languages from '../../../../editor/common/languages.js';
import { peekViewTitleBackground } from '../../../../editor/contrib/peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { contrastBorder, disabledForeground, listFocusOutline, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
const resolvedCommentViewIcon = registerColor('commentsView.resolvedIcon', { dark: disabledForeground, light: disabledForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('resolvedCommentIcon', 'Icon color for resolved comments.'));
const unresolvedCommentViewIcon = registerColor('commentsView.unresolvedIcon', { dark: listFocusOutline, light: listFocusOutline, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('unresolvedCommentIcon', 'Icon color for unresolved comments.'));
registerColor('editorCommentsWidget.replyInputBackground', peekViewTitleBackground, nls.localize('commentReplyInputBackground', 'Background color for comment reply input box.'));
const resolvedCommentBorder = registerColor('editorCommentsWidget.resolvedBorder', { dark: resolvedCommentViewIcon, light: resolvedCommentViewIcon, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('resolvedCommentBorder', 'Color of borders and arrow for resolved comments.'));
const unresolvedCommentBorder = registerColor('editorCommentsWidget.unresolvedBorder', { dark: unresolvedCommentViewIcon, light: unresolvedCommentViewIcon, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('unresolvedCommentBorder', 'Color of borders and arrow for unresolved comments.'));
export const commentThreadRangeBackground = registerColor('editorCommentsWidget.rangeBackground', transparent(unresolvedCommentBorder, .1), nls.localize('commentThreadRangeBackground', 'Color of background for comment ranges.'));
export const commentThreadRangeActiveBackground = registerColor('editorCommentsWidget.rangeActiveBackground', transparent(unresolvedCommentBorder, .1), nls.localize('commentThreadActiveRangeBackground', 'Color of background for currently selected or hovered comment range.'));
const commentThreadStateBorderColors = new Map([
    [languages.CommentThreadState.Unresolved, unresolvedCommentBorder],
    [languages.CommentThreadState.Resolved, resolvedCommentBorder],
]);
const commentThreadStateIconColors = new Map([
    [languages.CommentThreadState.Unresolved, unresolvedCommentViewIcon],
    [languages.CommentThreadState.Resolved, resolvedCommentViewIcon],
]);
export const commentThreadStateColorVar = '--comment-thread-state-color';
export const commentViewThreadStateColorVar = '--comment-view-thread-state-color';
export const commentThreadStateBackgroundColorVar = '--comment-thread-state-background-color';
function getCommentThreadStateColor(state, theme, map) {
    const colorId = (state !== undefined) ? map.get(state) : undefined;
    return (colorId !== undefined) ? theme.getColor(colorId) : undefined;
}
export function getCommentThreadStateBorderColor(state, theme) {
    return getCommentThreadStateColor(state, theme, commentThreadStateBorderColors);
}
export function getCommentThreadStateIconColor(state, theme) {
    return getCommentThreadStateColor(state, theme, commentThreadStateIconColors);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudENvbG9ycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudENvbG9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssU0FBUyxNQUFNLHdDQUF3QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2xHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFHdEosTUFBTSx1QkFBdUIsR0FBRyxhQUFhLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0FBQy9QLE1BQU0seUJBQXlCLEdBQUcsYUFBYSxDQUFDLDZCQUE2QixFQUFFLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLHFDQUFxQyxDQUFDLENBQUMsQ0FBQztBQUVuUSxhQUFhLENBQUMsMkNBQTJDLEVBQUUsdUJBQXVCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSwrQ0FBK0MsQ0FBQyxDQUFDLENBQUM7QUFDbEwsTUFBTSxx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