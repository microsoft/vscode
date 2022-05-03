/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import * as languages from 'vs/editor/common/languages';
import { peekViewBorder } from 'vs/editor/contrib/peekView/browser/peekView';
import * as nls from 'vs/nls';
import { contrastBorder, disabledForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme } from 'vs/platform/theme/common/themeService';

const resolvedCommentBorder = registerColor('editorCommentsWidget.resolvedBorder', { dark: disabledForeground, light: disabledForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('resolvedCommentBorder', 'Color of borders and arrow for resolved comments.'));
const unresolvedCommentBorder = registerColor('editorCommentsWidget.unresolvedBorder', { dark: peekViewBorder, light: peekViewBorder, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('unresolvedCommentBorder', 'Color of borders and arrow for unresolved comments.'));
export const commentThreadRangeBackground = registerColor('editorCommentsWidget.rangeBackground', { dark: transparent(unresolvedCommentBorder, .1), light: transparent(unresolvedCommentBorder, .1), hcDark: transparent(unresolvedCommentBorder, .1), hcLight: transparent(unresolvedCommentBorder, .1) }, nls.localize('commentThreadRangeBackground', 'Color of background for comment ranges.'));
export const commentThreadRangeBorder = registerColor('editorCommentsWidget.rangeBorder', { dark: transparent(unresolvedCommentBorder, .4), light: transparent(unresolvedCommentBorder, .4), hcDark: transparent(unresolvedCommentBorder, .4), hcLight: transparent(unresolvedCommentBorder, .4) }, nls.localize('commentThreadRangeBorder', 'Color of border for comment ranges.'));
export const commentThreadRangeActiveBackground = registerColor('editorCommentsWidget.rangeActiveBackground', { dark: transparent(unresolvedCommentBorder, .1), light: transparent(unresolvedCommentBorder, .1), hcDark: transparent(unresolvedCommentBorder, .1), hcLight: transparent(unresolvedCommentBorder, .1) }, nls.localize('commentThreadActiveRangeBackground', 'Color of background for currently selected or hovered comment range.'));
export const commentThreadRangeActiveBorder = registerColor('editorCommentsWidget.rangeActiveBorder', { dark: transparent(unresolvedCommentBorder, .4), light: transparent(unresolvedCommentBorder, .4), hcDark: transparent(unresolvedCommentBorder, .4), hcLight: transparent(unresolvedCommentBorder, .2) }, nls.localize('commentThreadActiveRangeBorder', 'Color of border for currently selected or hovered comment range.'));

const commentThreadStateColors = new Map([
	[languages.CommentThreadState.Unresolved, unresolvedCommentBorder],
	[languages.CommentThreadState.Resolved, resolvedCommentBorder],
]);

export const commentThreadStateColorVar = '--comment-thread-state-color';
export const commentViewThreadStateColorVar = '--comment-view-thread-state-color';
export const commentThreadStateBackgroundColorVar = '--comment-thread-state-background-color';

export function getCommentThreadStateColor(state: languages.CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
	const colorId = (state !== undefined) ? commentThreadStateColors.get(state) : undefined;
	return (colorId !== undefined) ? theme.getColor(colorId) : undefined;
}
