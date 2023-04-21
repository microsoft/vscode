/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { BracketPairColorizationOptions, IModelDecoration } from 'vs/editor/common/model';
import { BracketInfo } from 'vs/editor/common/textModelBracketPairs';
import { DecorationProvider } from 'vs/editor/common/model/decorationProvider';
import { TextModel } from 'vs/editor/common/model/textModel';
import {
	editorBracketHighlightingUnexpectedBracketForeground,
	editorBracketHighlightingForeground1,
	editorBracketHighlightingForeground2,
	editorBracketHighlightingForeground3,
	editorBracketHighlightingForeground4,
	editorBracketHighlightingForeground5,
	editorBracketHighlightingForeground6,
	editorBracketHighlightingForeground7,
	editorBracketHighlightingForeground8,
	editorBracketHighlightingForeground9,
	editorBracketHighlightingForeground10,
	editorBracketHighlightingForeground11,
	editorBracketHighlightingForeground12,
	editorBracketHighlightingForeground13,
	editorBracketHighlightingForeground14,
	editorBracketHighlightingForeground15,
	editorBracketHighlightingForeground16,
	editorBracketHighlightingForeground17,
	editorBracketHighlightingForeground18,
	editorBracketHighlightingForeground19,
	editorBracketHighlightingForeground20,
	editorBracketHighlightingForeground21,
	editorBracketHighlightingForeground22,
	editorBracketHighlightingForeground23,
	editorBracketHighlightingForeground24,
} from 'vs/editor/common/core/editorColorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IModelOptionsChangedEvent } from 'vs/editor/common/textModelEvents';

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
		// return `bracket-highlighting-${level % 5_354_228_880}`; // necessary to go this high? this is the lcm of all numbers from 1 to 24
	}
}

registerThemingParticipant((theme, collector) => {
	const colors = [
		editorBracketHighlightingForeground1,
		editorBracketHighlightingForeground2,
		editorBracketHighlightingForeground3,
		editorBracketHighlightingForeground4,
		editorBracketHighlightingForeground5,
		editorBracketHighlightingForeground6,
		editorBracketHighlightingForeground7,
		editorBracketHighlightingForeground8,
		editorBracketHighlightingForeground9,
		editorBracketHighlightingForeground10,
		editorBracketHighlightingForeground11,
		editorBracketHighlightingForeground12,
		editorBracketHighlightingForeground13,
		editorBracketHighlightingForeground14,
		editorBracketHighlightingForeground15,
		editorBracketHighlightingForeground16,
		editorBracketHighlightingForeground17,
		editorBracketHighlightingForeground18,
		editorBracketHighlightingForeground19,
		editorBracketHighlightingForeground20,
		editorBracketHighlightingForeground21,
		editorBracketHighlightingForeground22,
		editorBracketHighlightingForeground23,
		editorBracketHighlightingForeground24,
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
