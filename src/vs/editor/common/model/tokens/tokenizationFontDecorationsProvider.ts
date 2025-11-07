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
import { classNameForFont } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';

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

	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly fontInfo = new Map<number, IFontOption[]>();

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			for (const fontChange of fontChanges) {
				if (!fontChange.options) {
					continue;
				}
				this.fontInfo.set(fontChange.lineNumber, fontChange.options);
				for (const option of fontChange.options) {
					if (option.lineHeight) {
						affectedLineHeights.add(new LineHeightChangingDecoration(0, classNameForFont(option.fontFamily ?? '', option.fontSize ?? ''), fontChange.lineNumber, option.lineHeight));
						break;
					}
				}
			}
			this._onDidChangeLineHeight.fire(affectedLineHeights);
		});
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		const decorations: IModelDecoration[] = [];
		for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
			if (this.fontInfo.has(i)) {
				const fontOptions = this.fontInfo.get(i)!;
				if (fontOptions) {
					for (const fontOption of fontOptions) {
						const lastOffset = i > 0 ? this.textModel.getOffsetAt(new Position(i - 1, this.textModel.getLineMaxColumn(i - 1))) : 0;
						const startOffset = lastOffset + fontOption.startIndex + 1;
						const endOffset = lastOffset + fontOption.endIndex + 1;
						const startPosition = this.textModel.getPositionAt(startOffset);
						const endPosition = this.textModel.getPositionAt(endOffset);
						const className = classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? '');
						decorations.push({
							id: className,
							options: {
								description: 'FontOptionDecoration',
								inlineClassName: className,
								affectsFont: true
							},
							ownerId: 0,
							range: Range.fromPositions(startPosition, endPosition)
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
