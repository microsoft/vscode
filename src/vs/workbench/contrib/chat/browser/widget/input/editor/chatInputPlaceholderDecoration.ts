/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../../../../../../../editor/common/core/range.js';
import { inputPlaceholderForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';

/**
 * Computes the editor range used to render inline placeholder (ghost text)
 * after a parsed part, spanning from just after the part to the end of the line.
 */
export function getRangeForPlaceholder(editorRange: IRange): IRange {
	return {
		startLineNumber: editorRange.startLineNumber,
		endLineNumber: editorRange.endLineNumber,
		startColumn: editorRange.endColumn + 1,
		endColumn: 1000
	};
}

/**
 * Resolves the color used for inline placeholder / ghost text in the chat input.
 */
export function getInputPlaceholderColor(themeService: IThemeService): string | undefined {
	const theme = themeService.getColorTheme();
	const transparentForeground = theme.getColor(inputPlaceholderForeground);
	return transparentForeground?.toString();
}
