/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { IDecorationOptions, IDecorationRenderOptions } from '../../editorCommon.js';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { Position } from '../../core/position.js';
import { hash } from '../../../../base/common/hash.js';

export class TokenizationFontDecorations extends Disposable {

	private static readonly TOKENIZATION_FONT_DECORATIONS_DESCRIPTION = 'Text-mate based font decorations';
	private static readonly TOKENIZATION_FONT_DECORATIONS_TYPE = 'text-mate-font-decorations';

	private readonly _model: ITextModel;
	private readonly _decorationIdToType = new Map<string, string>();
	private readonly _decorationTypeToCount = new Map<string, number>();

	constructor(
		model: ITextModel,
		tokenizationTextModelPart: TokenizationTextModelPart,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super();
		this._model = model;
		this._codeEditorService.registerDecorationType(TokenizationFontDecorations.TOKENIZATION_FONT_DECORATIONS_DESCRIPTION, TokenizationFontDecorations.TOKENIZATION_FONT_DECORATIONS_TYPE, {});
		this._register(tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			const decorations: IDecorationOptions[] = [];
			const linesChanged: Set<number> = new Set<number>();
			for (const fontChange of fontChanges) {
				const lineNumber = fontChange.lineNumber;
				for (const fontOptions of fontChange.options) {
					let lastOffset: number = 0;
					if (lineNumber > 1) {
						const previousLine = lineNumber - 1;
						const previousPosition = new Position(previousLine, this._model.getLineMaxColumn(previousLine));
						lastOffset = this._model.getOffsetAt(previousPosition) + 1;
					}
					const startIndex = lastOffset + fontOptions.startIndex;
					const endIndex = startIndex + fontOptions.length;
					const startPosition = this._model.getPositionAt(startIndex);
					const endPosition = this._model.getPositionAt(endIndex);
					const range = Range.fromPositions(startPosition, endPosition);
					const renderOptions: IDecorationRenderOptions = {
						lineHeight: fontOptions.lineHeight ?? undefined,
						fontSize: fontOptions.fontSize ?? undefined,
						fontFamily: fontOptions.fontFamily ?? undefined,
						rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
					};
					decorations.push({ range, renderOptions });
				}
				linesChanged.add(lineNumber);
			}
			this.setFontDecorationsByType(linesChanged, decorations);
		}));
	}


	public setFontDecorationsByType(linesChanged: Set<number>, decorationOptions: IDecorationOptions[]): void {
		const oldFontDecorationsIds: string[] = this.getOldFontDecorationIds(linesChanged);
		const newModelFontDecorations: IModelDeltaDecoration[] = this.getNewModelFontDecorations(decorationOptions);
		const newDecorationIds = this._model.changeDecorations(accessor => accessor.deltaDecorations(oldFontDecorationsIds, newModelFontDecorations));
		this.updateMaps(newDecorationIds);
	}

	private getOldFontDecorationIds(linesChanged: Set<number>): string[] {
		const oldDecorationsIds: string[] = [];
		for (const lineNumber of linesChanged) {
			const decorationsOnLine = this._model.getDecorationsInRange(new Range(lineNumber, 1, lineNumber, this._model.getLineMaxColumn(lineNumber)));
			for (const decoration of decorationsOnLine) {
				const decorationId = decoration.id;
				if (this._decorationIdToType.has(decorationId)) {
					oldDecorationsIds.push(decorationId);
					this._decorationIdToType.delete(decorationId);
					const decorationType = this._decorationIdToType.get(decorationId)!;
					if (this._decorationTypeToCount.has(decorationType)) {
						const count = this._decorationTypeToCount.get(decorationType)! - 1;
						if (count === 0) {
							this._codeEditorService.removeDecorationType(decorationType);
							this._decorationTypeToCount.delete(decorationType);
						} else {
							this._decorationTypeToCount.set(decorationType, count);
						}
					}
				}
			}
		}
		return oldDecorationsIds;
	}

	private getNewModelFontDecorations(decorationOptions: IDecorationOptions[]): IModelDeltaDecoration[] {
		const newModelDecorations: IModelDeltaDecoration[] = [];
		for (const decorationOption of decorationOptions) {
			const renderOptions = decorationOption.renderOptions;
			if (!renderOptions) {
				continue;
			}
			const decorationType = TokenizationFontDecorations.TOKENIZATION_FONT_DECORATIONS_TYPE + '-' + hash(renderOptions).toString(16);
			if (!this._codeEditorService.hasDecorationType(decorationType)) {
				this._codeEditorService.registerDecorationType(TokenizationFontDecorations.TOKENIZATION_FONT_DECORATIONS_DESCRIPTION, decorationType, renderOptions);
			}
			newModelDecorations.push({ range: decorationOption.range, options: this._codeEditorService.resolveDecorationOptions(decorationType, false) });
		}
		return newModelDecorations;
	}

	private updateMaps(decorationIds: string[] | null) {
		if (!decorationIds) {
			return;
		}
		for (const decorationId of decorationIds) {
			const options = this._model.getDecorationOptions(decorationId);
			if (!options) {
				continue;
			}
			const type = options.type;
			if (!type) {
				continue;
			}
			this._decorationIdToType.set(decorationId, type);
			this._decorationTypeToCount.set(type, (this._decorationTypeToCount.get(type) || 0) + 1);
		}
	}
}
