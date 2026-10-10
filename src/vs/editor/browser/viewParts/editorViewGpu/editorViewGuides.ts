/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { editorBracketHighlightingForeground1, editorBracketHighlightingForeground2, editorBracketHighlightingForeground3, editorBracketHighlightingForeground4, editorBracketHighlightingForeground5, editorBracketHighlightingForeground6, editorBracketPairGuideBackground1, editorBracketPairGuideBackground2, editorBracketPairGuideBackground3, editorBracketPairGuideBackground4, editorBracketPairGuideBackground5, editorBracketPairGuideBackground6, editorBracketPairGuideActiveBackground1, editorBracketPairGuideActiveBackground2, editorBracketPairGuideActiveBackground3, editorBracketPairGuideActiveBackground4, editorBracketPairGuideActiveBackground5, editorBracketPairGuideActiveBackground6 } from '../../../common/core/editorColorRegistry.js';
import { BracketPairGuidesClassNames } from '../../../common/model/guidesTextModelPart.js';
import { IndentGuide } from '../../../common/textModelGuides.js';
import { BracketGuideInput } from './editorViewTypes.js';

export class EditorViewBracketGuideColors {
	private readonly _colors = new Map<string, Color | undefined>();

	constructor(theme: Pick<IColorTheme, 'getColor'>) {
		const nonTransparent = (color: Color | undefined) => color?.isTransparent() ? undefined : color;
		const palette = [
			[editorBracketHighlightingForeground1, editorBracketPairGuideBackground1, editorBracketPairGuideActiveBackground1],
			[editorBracketHighlightingForeground2, editorBracketPairGuideBackground2, editorBracketPairGuideActiveBackground2],
			[editorBracketHighlightingForeground3, editorBracketPairGuideBackground3, editorBracketPairGuideActiveBackground3],
			[editorBracketHighlightingForeground4, editorBracketPairGuideBackground4, editorBracketPairGuideActiveBackground4],
			[editorBracketHighlightingForeground5, editorBracketPairGuideBackground5, editorBracketPairGuideActiveBackground5],
			[editorBracketHighlightingForeground6, editorBracketPairGuideBackground6, editorBracketPairGuideActiveBackground6],
		].map(([bracketId, inactiveId, activeId]) => {
			const bracket = theme.getColor(bracketId);
			return {
				inactive: nonTransparent(nonTransparent(theme.getColor(inactiveId)) ?? bracket?.transparent(0.3)),
				active: nonTransparent(nonTransparent(theme.getColor(activeId)) ?? bracket),
			};
		}).filter(colors => colors.inactive && colors.active);
		const names = new BracketPairGuidesClassNames();
		for (let level = 0; level < 30; level++) {
			const colors = palette.length > 0 ? palette[level % palette.length] : undefined;
			const className = names.getInlineClassNameOfLevel(level);
			this._colors.set(className, colors?.inactive);
			this._colors.set(`${className} ${names.activeClassName}`, colors?.active);
		}
	}

	public getColor(className: string): Color | undefined {
		if (!this._colors.has(className)) {
			throw new BugIndicatingError(`Unexpected bracket guide class: ${className}`);
		}
		return this._colors.get(className);
	}
}

export function toEditorViewBracketGuide(guide: IndentGuide, color: number): BracketGuideInput {
	const position = guide.column === -1
		? { visibleColumn: guide.visibleColumn - 1 }
		: { column: guide.column - 1 };
	return {
		...position,
		color,
		horizontalLine: guide.horizontalLine
			? { top: guide.horizontalLine.top, endColumn: guide.horizontalLine.endColumn - 1 }
			: undefined,
	};
}
