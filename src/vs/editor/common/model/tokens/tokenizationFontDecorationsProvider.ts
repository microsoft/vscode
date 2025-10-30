/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IModelDecoration } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { DecorationProvider } from '../decorationProvider.js';
import { TextModel } from '../textModel.js';
import { Emitter } from '../../../../base/common/event.js';
import { IFontOption } from '../../languages.js';
import { IModelOptionsChangedEvent } from '../../textModelEvents.js';
import { hash } from '../../../../base/common/hash.js';

export class LineHeightChangingDecoration {

	public static toKey(obj: LineHeightChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number,
		public readonly lineHeight: number | null
	) { }
}

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider<Set<LineHeightChangingDecoration>> {

	private readonly onDidChangeEmitter = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private readonly specialFontInfo = new Map<number, IFontOption[]>();

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			for (const fontChange of fontChanges) {
				this.specialFontInfo.set(fontChange.lineNumber, fontChange.options);
				for (const option of fontChange.options) {
					if (option.lineHeight) {
						const fontHash = hash(`${option.fontFamily}-${option.fontSize}-${option.lineHeight}`);
						affectedLineHeights.add(new LineHeightChangingDecoration(0, `font-decoration-${fontHash}`, fontChange.lineNumber, option.lineHeight));
						break;
					}
				}
			}
			this.onDidChangeEmitter.fire(affectedLineHeights);
		});
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		const decorations: IModelDecoration[] = [];
		for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
			if (this.specialFontInfo.has(i)) {
				const fontOptions = this.specialFontInfo.get(i);
				if (fontOptions) {
					for (const fontOption of fontOptions) {
						const hashFont = hash(`${fontOption.fontFamily}-${fontOption.fontSize}-${fontOption.lineHeight}`);
						decorations.push({
							id: `font-decoration-${hashFont}`,
							options: {
								description: 'FontOptionDecoration',
								inlineClassName: `font-decoration-${hashFont}`,
							},
							ownerId: 0,
							range: new Range(i, fontOption.startIndex + 1, i, fontOption.endIndex + 1)
						});
					}
				}
			}
		}
		return decorations;
	}

	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), 1),
			ownerId,
			filterOutValidation
		);
	}
}

/*
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
			// const style = document.createElement('style');
			// style.type = 'text/css';
			// style.media = 'screen';
			// mainWindow.document.head.appendChild(style);

			// const providerArgs: ProviderArguments = {
			// 	styleSheet: styleSheet,
			// 	key: key,
			// 	parentTypeKey: parentTypeKey,
			// 	options: options || Object.create(null)
			// };
			// if (!parentTypeKey) {
			// 	provider = new DecorationTypeOptionsProvider(description, key, this._themeService, styleSheet, providerArgs);
			// } else {
			// 	provider = new DecorationSubTypeOptionsProvider(this._themeService, styleSheet, providerArgs);
			// }
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
*/
