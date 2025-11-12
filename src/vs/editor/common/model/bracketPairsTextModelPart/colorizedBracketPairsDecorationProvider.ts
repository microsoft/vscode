/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../core/range.js';
import { BracketPairColorizationOptions, IModelDecoration } from '../../model.js';
import { BracketInfo } from '../../textModelBracketPairs.js';
import { DecorationProvider } from '../decorationProvider.js';
import { TextModel } from '../textModel.js';
import {
	editorBracketHighlightingForeground1, editorBracketHighlightingForeground2, editorBracketHighlightingForeground3, editorBracketHighlightingForeground4, editorBracketHighlightingForeground5, editorBracketHighlightingForeground6, editorBracketHighlightingUnexpectedBracketForeground
} from '../../core/editorColorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { IModelOptionsChangedEvent } from '../../textModelEvents.js';

export class ColorizedBracketPairsDecorationProvider extends Disposable implements DecorationProvider {
	private colorizationOptions: BracketPairColorizationOptions;
	private readonly colorProvider = new ColorProvider();

	private readonly onDidChangeEmitter = new Emitter<void>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(private readonly textModel: TextModel) {
		super();

		this.colorizationOptions = textModel.getOptions().bracketPairColorizationOptions;

		this._register(textModel.bracketPairs.onDidChange(e => {
			this.onDidChangeEmitter.fire();
		}));
	}

	//#region TextModel events

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void {
		this.colorizationOptions = this.textModel.getOptions().bracketPairColorizationOptions;
	}

	//#endregion

	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		if (onlyMinimapDecorations) {
			// Bracket pair colorization decorations are not rendered in the minimap
			return [];
		}
		if (ownerId === undefined) {
			return [];
		}
		if (!this.colorizationOptions.enabled) {
			return [];
		}

		const result = this.textModel.bracketPairs.getBracketsInRange(range, true).map<IModelDecoration>(bracket => ({
			id: `bracket${bracket.range.toString()}-${bracket.nestingLevel}`,
			options: {
				description: 'BracketPairColorization',
				inlineClassName: this.colorProvider.getInlineClassName(
					bracket,
					this.colorizationOptions.independentColorPoolPerBracketType
				),
			},
			ownerId: 0,
			range: bracket.range,
		})).toArray();

		return result;
	}

	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		if (ownerId === undefined) {
			return [];
		}
		if (!this.colorizationOptions.enabled) {
			return [];
		}
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), 1),
			ownerId,
			filterOutValidation
		);
	}
}

class ColorProvider {
	public readonly unexpectedClosingBracketClassName = 'unexpected-closing-bracket';

	getInlineClassName(bracket: BracketInfo, independentColorPoolPerBracketType: boolean): string {
		if (bracket.isInvalid) {
			return this.unexpectedClosingBracketClassName;
		}
		return this.getInlineClassNameOfLevel(independentColorPoolPerBracketType ? bracket.nestingLevelOfEqualBracketType : bracket.nestingLevel);
	}

	getInlineClassNameOfLevel(level: number): string {
		// To support a dynamic amount of colors up to 6 colors,
		// we use a number that is a lcm of all numbers from 1 to 6.
		return `bracket-highlighting-${level % 30}`;
	}
}

registerThemingParticipant((theme, collector) => {
	const colors = [
		editorBracketHighlightingForeground1,
		editorBracketHighlightingForeground2,
		editorBracketHighlightingForeground3,
		editorBracketHighlightingForeground4,
		editorBracketHighlightingForeground5,
		editorBracketHighlightingForeground6
	];
	const colorProvider = new ColorProvider();

	collector.addRule(`.monaco-editor .${colorProvider.unexpectedClosingBracketClassName} { color: ${theme.getColor(editorBracketHighlightingUnexpectedBracketForeground)}; }`);

	const colorValues = colors
		.map(c => theme.getColor(c))
		.filter((c): c is Color => !!c)
		.filter(c => !c.isTransparent());

	for (let level = 0; level < 30; level++) {
		const color = colorValues[level % colorValues.length];
		collector.addRule(`.monaco-editor .${colorProvider.getInlineClassNameOfLevel(level)} { color: ${color}; }`);
	}
});
