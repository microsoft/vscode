/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';
import { ColorId, TokenMetadata, ITokenPresentation, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageIdCodec } from 'vs/editor/common/languages';

/**
 * A token on a line.
 */
export class TestLineToken {

	/**
	 * last char index of this token (not inclusive).
	 */
	public readonly endIndex: number;
	private readonly _metadata: number;

	constructor(endIndex: number, metadata: number) {
		this.endIndex = endIndex;
		this._metadata = metadata;
	}

	public getStandardTokenType(): StandardTokenType {
		return TokenMetadata.getTokenType(this._metadata);
	}

	public getForeground(): ColorId {
		return TokenMetadata.getForeground(this._metadata);
	}

	public getType(): string {
		return TokenMetadata.getClassNameFromMetadata(this._metadata);
	}

	public getInlineStyle(colorMap: string[]): string {
		return TokenMetadata.getInlineStyleFromMetadata(this._metadata, colorMap);
	}

	public getPresentation(): ITokenPresentation {
		return TokenMetadata.getPresentationFromMetadata(this._metadata);
	}

	private static _equals(a: TestLineToken, b: TestLineToken): boolean {
		return (
			a.endIndex === b.endIndex
			&& a._metadata === b._metadata
		);
	}

	public static equalsArr(a: TestLineToken[], b: TestLineToken[]): boolean {
		const aLen = a.length;
		const bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			if (!this._equals(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
}

export class TestLineTokens implements IViewLineTokens {

	private readonly _actual: TestLineToken[];

	constructor(actual: TestLineToken[]) {
		this._actual = actual;
	}

	public equals(other: IViewLineTokens): boolean {
		if (other instanceof TestLineTokens) {
			return TestLineToken.equalsArr(this._actual, other._actual);
		}
		return false;
	}

	public getCount(): number {
		return this._actual.length;
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		return this._actual[tokenIndex].getStandardTokenType();
	}

	public getForeground(tokenIndex: number): ColorId {
		return this._actual[tokenIndex].getForeground();
	}

	public getEndOffset(tokenIndex: number): number {
		return this._actual[tokenIndex].endIndex;
	}

	public getClassName(tokenIndex: number): string {
		return this._actual[tokenIndex].getType();
	}

	public getInlineStyle(tokenIndex: number, colorMap: string[]): string {
		return this._actual[tokenIndex].getInlineStyle(colorMap);
	}

	public getPresentation(tokenIndex: number): ITokenPresentation {
		return this._actual[tokenIndex].getPresentation();
	}

	public findTokenIndexAtOffset(offset: number): number {
		throw new Error('Not implemented');
	}

	public getLineContent(): string {
		throw new Error('Not implemented');
	}

	public getMetadata(tokenIndex: number): number {
		throw new Error('Method not implemented.');
	}

	public getLanguageId(tokenIndex: number): string {
		throw new Error('Method not implemented.');
	}

	public getTokenText(tokenIndex: number): string {
		throw new Error('Method not implemented.');
	}

	public forEach(callback: (tokenIndex: number) => void): void {
		throw new Error('Not implemented');
	}

	public get languageIdCodec(): ILanguageIdCodec {
		throw new Error('Not implemented');
	}
}

export class TestLineTokenFactory {

	public static inflateArr(tokens: Uint32Array): TestLineToken[] {
		const tokensCount = (tokens.length >>> 1);

		const result: TestLineToken[] = new Array<TestLineToken>(tokensCount);
		for (let i = 0; i < tokensCount; i++) {
			const endOffset = tokens[i << 1];
			const metadata = tokens[(i << 1) + 1];

			result[i] = new TestLineToken(endOffset, metadata);
		}

		return result;
	}

}
