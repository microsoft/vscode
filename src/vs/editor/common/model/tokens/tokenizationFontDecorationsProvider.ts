/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IModelDecorationOptions, IModelDeltaDecoration } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { TextModel } from '../textModel.js';
import { classNameForFont } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';

export class TokenizationFontDecorationProvider extends Disposable {

	private readonly fontDecorationIds = new Set<string>();

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this._register(this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			textModel.changeDecorations((accessor) => {
				for (const fontChange of fontChanges) {
					const lineNumber = fontChange.lineNumber;
					const newDecorations: IModelDeltaDecoration[] = fontChange.options.map(fontOption => {
						const lastOffset = lineNumber > 1 ? this.textModel.getOffsetAt(new Position(lineNumber - 1, this.textModel.getLineMaxColumn(lineNumber - 1))) + 1 : 0;
						const startOffset = lastOffset + fontOption.startIndex;
						const endOffset = lastOffset + fontOption.endIndex;
						const startPosition = this.textModel.getPositionAt(startOffset);
						const endPosition = this.textModel.getPositionAt(endOffset);
						const range = Range.fromPositions(startPosition, endPosition);
						const options: IModelDecorationOptions = {
							description: 'FontOptionDecoration',
							inlineClassName: classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? ''),
							fontFamily: fontOption.fontFamily,
							fontSize: fontOption.fontSize,
							lineHeight: fontOption.lineHeight,
							affectsFont: true,
						};
						const decoration: IModelDeltaDecoration = { range, options };
						return decoration;
					});

					const decorationsOnLine = textModel.getDecorationsInRange(new Range(lineNumber, 1, lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
					const oldDecorationIds: string[] = [];
					for (const decorationOnLine of decorationsOnLine) {
						if (this.fontDecorationIds.has(decorationOnLine.id)) {
							oldDecorationIds.push(decorationOnLine.id);
							this.fontDecorationIds.delete(decorationOnLine.id);
						}
					}
					const newDecorationIds = accessor.deltaDecorations(oldDecorationIds, newDecorations);
					for (const newDecorationId of newDecorationIds) {
						this.fontDecorationIds.add(newDecorationId);
					}
				}
			});
		}));
	}
}
