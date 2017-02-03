/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { ColorId, FontStyle, StandardTokenType, MetadataConsts, LanguageId } from 'vs/editor/common/modes';

export class TokenMetadata {

	public static toBinaryStr(metadata: number): string {
		let r = metadata.toString(2);
		while (r.length < 32) {
			r = '0' + r;
		}
		return r;
	}

	public static printMetadata(metadata: number): void {
		let languageId = TokenMetadata.getLanguageId(metadata);
		let tokenType = TokenMetadata.getTokenType(metadata);
		let fontStyle = TokenMetadata.getFontStyle(metadata);
		let foreground = TokenMetadata.getForeground(metadata);
		let background = TokenMetadata.getBackground(metadata);

		console.log({
			languageId: languageId,
			tokenType: tokenType,
			fontStyle: fontStyle,
			foreground: foreground,
			background: background,
		});
	}

	public static getLanguageId(metadata: number): LanguageId {
		return (metadata & MetadataConsts.LANGUAGEID_MASK) >>> MetadataConsts.LANGUAGEID_OFFSET;
	}

	public static getTokenType(metadata: number): StandardTokenType {
		return (metadata & MetadataConsts.TOKEN_TYPE_MASK) >>> MetadataConsts.TOKEN_TYPE_OFFSET;
	}

	public static getFontStyle(metadata: number): FontStyle {
		return (metadata & MetadataConsts.FONT_STYLE_MASK) >>> MetadataConsts.FONT_STYLE_OFFSET;
	}

	public static getForeground(metadata: number): ColorId {
		return (metadata & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET;
	}

	public static getBackground(metadata: number): ColorId {
		return (metadata & MetadataConsts.BACKGROUND_MASK) >>> MetadataConsts.BACKGROUND_OFFSET;
	}

	private static _getClassNameFromMetadata(metadata: number): string {
		let foreground = this.getForeground(metadata);
		let className = 'mtk' + foreground;

		let fontStyle = this.getFontStyle(metadata);
		if (fontStyle & FontStyle.Italic) {
			className += ' mtki';
		}
		if (fontStyle & FontStyle.Bold) {
			className += ' mtkb';
		}
		if (fontStyle & FontStyle.Underline) {
			className += ' mtku';
		}

		return className;
	}

	public static inflateArr(tokens: Uint32Array, lineLength: number): ViewLineToken[] {
		let result: ViewLineToken[] = [];

		for (let i = 0, len = (tokens.length >>> 1); i < len; i++) {
			let endOffset = (i + 1 < len ? tokens[((i + 1) << 1)] : lineLength);
			let metadata = tokens[(i << 1) + 1];

			result[i] = new ViewLineToken(endOffset, this._getClassNameFromMetadata(metadata));
		}

		return result;
	}

	public static sliceAndInflate(tokens: Uint32Array, startOffset: number, endOffset: number, deltaOffset: number, lineLength: number): ViewLineToken[] {
		let tokenIndex = this.findIndexInSegmentsArray(tokens, startOffset);
		let result: ViewLineToken[] = [], resultLen = 0;

		for (let i = tokenIndex, len = (tokens.length >>> 1); i < len; i++) {
			let tokenStartOffset = tokens[(i << 1)];

			if (tokenStartOffset >= endOffset) {
				break;
			}

			let tokenEndOffset = (i + 1 < len ? tokens[((i + 1) << 1)] : lineLength);
			let newEndOffset = tokenEndOffset - startOffset + deltaOffset;
			let metadata = tokens[(i << 1) + 1];

			result[resultLen++] = new ViewLineToken(newEndOffset, this._getClassNameFromMetadata(metadata));
		}

		return result;
	}

	public static findIndexInSegmentsArray(tokens: Uint32Array, desiredIndex: number): number {

		let low = 0;
		let high = (tokens.length >>> 1) - 1;

		while (low < high) {

			let mid = low + Math.ceil((high - low) / 2);

			let value = tokens[(mid << 1)];

			if (value > desiredIndex) {
				high = mid - 1;
			} else {
				low = mid;
			}
		}

		return low;
	}
}
