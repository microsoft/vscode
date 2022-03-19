/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import * as languages from 'vs/editor/common/languages';
import * as nls from 'vs/nls';
import { contrastBorder, editorWarningForeground, editorWidgetForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme } from 'vs/platform/theme/common/themeService';

export const resolvedCommentBorder = registerColor('comments.resolved.border', { dark: editorWidgetForeground, light: editorWidgetForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('resolvedCommentBorder', 'Color of borders and arrow for resolved comments.'));
export const unresolvedCommentBorder = registerColor('comments.unresolved.border', { dark: editorWarningForeground, light: editorWarningForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('unresolvedCommentBorder', 'Color of borders and arrow for unresolved comments.'));

const commentThreadStateColors = new Map([
	[languages.CommentThreadState.Unresolved, unresolvedCommentBorder],
	[languages.CommentThreadState.Resolved, resolvedCommentBorder],
]);

export const commentThreadStateColorVar = '--comment-thread-state-color';

export function getCommentThreadStateColor(thread: languages.CommentThread, theme: IColorTheme): Color | undefined {
	const colorId = thread.state !== undefined ? commentThreadStateColors.get(thread.state) : undefined;
	return colorId !== undefined ? theme.getColor(colorId) : undefined;
}
