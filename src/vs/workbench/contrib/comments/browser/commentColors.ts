/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import * as languages from 'vs/editor/common/languages';
import { peekViewBorder } from 'vs/editor/contrib/peekView/browser/peekView';
import * as nls from 'vs/nls';
import { contrastBorder, disabledForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme } from 'vs/platform/theme/common/themeService';

const resolvedCommentBorder = registerColor('comments.resolved.border', { dark: disabledForeground, light: disabledForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('resolvedCommentBorder', 'Color of borders and arrow for resolved comments.'));
const unresolvedCommentBorder = registerColor('comments.unresolved.border', { dark: peekViewBorder, light: peekViewBorder, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('unresolvedCommentBorder', 'Color of borders and arrow for unresolved comments.'));

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
