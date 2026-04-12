/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TokenMetadata } from '../../../common/encodedTokenAttributes.js';
/**
 * A token on a line.
 */
export class TestLineToken {
    constructor(endIndex, metadata) {
        this.endIndex = endIndex;
        this._metadata = metadata;
    }
    getStandardTokenType() {
        return TokenMetadata.getTokenType(this._metadata);
    }
    getForeground() {
        return TokenMetadata.getForeground(this._metadata);
    }
    getType() {
        return TokenMetadata.getClassNameFromMetadata(this._metadata);
    }
    getInlineStyle(colorMap) {
        return TokenMetadata.getInlineStyleFromMetadata(this._metadata, colorMap);
    }
    getPresentation() {
        return TokenMetadata.getPresentationFromMetadata(this._metadata);
    }
    static _equals(a, b) {
        return (a.endIndex === b.endIndex
            && a._metadata === b._metadata);
    }
    static equalsArr(a, b) {
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
export class TestLineTokens {
    constructor(actual) {
        this._actual = actual;
    }
    equals(other) {
        if (other instanceof TestLineTokens) {
            return TestLineToken.equalsArr(this._actual, other._actual);
        }
        return false;
    }
    getCount() {
        return this._actual.length;
    }
    getStandardTokenType(tokenIndex) {
        return this._actual[tokenIndex].getStandardTokenType();
    }
    getForeground(tokenIndex) {
        return this._actual[tokenIndex].getForeground();
    }
    getEndOffset(tokenIndex) {
        return this._actual[tokenIndex].endIndex;
    }
    getClassName(tokenIndex) {
        return this._actual[tokenIndex].getType();
    }
    getInlineStyle(tokenIndex, colorMap) {
        return this._actual[tokenIndex].getInlineStyle(colorMap);
    }
    getPresentation(tokenIndex) {
        return this._actual[tokenIndex].getPresentation();
    }
    findTokenIndexAtOffset(offset) {
        throw new Error('Not implemented');
    }
    getLineContent() {
        throw new Error('Not implemented');
    }
    getMetadata(tokenIndex) {
        throw new Error('Method not implemented.');
    }
    getLanguageId(tokenIndex) {
        throw new Error('Method not implemented.');
    }
    getTokenText(tokenIndex) {
        throw new Error('Method not implemented.');
    }
    forEach(callback) {
        throw new Error('Not implemented');
    }
    get languageIdCodec() {
        throw new Error('Not implemented');
    }
}
export class TestLineTokenFactory {
    static inflateArr(tokens) {
        const tokensCount = (tokens.length >>> 1);
        const result = new Array(tokensCount);
        for (let i = 0; i < tokensCount; i++) {
            const endOffset = tokens[i << 1];
            const metadata = tokens[(i << 1) + 1];
            result[i] = new TestLineToken(endOffset, metadata);
        }
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdExpbmVUb2tlbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9jb3JlL3Rlc3RMaW5lVG9rZW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFXLGFBQWEsRUFBeUMsTUFBTSwyQ0FBMkMsQ0FBQztBQUcxSDs7R0FFRztBQUNILE1BQU0sT0FBTyxhQUFhO0lBUXpCLFlBQVksUUFBZ0IsRUFBRSxRQUFnQjtRQUM3QyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztJQUMzQixDQUFDO0lBRU0sb0JBQW9CO1FBQzFCLE9BQU8sYUFBYSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVNLGFBQWE7UUFDbkIsT0FBTyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU0sT0FBTztRQUNiLE9BQU8sYUFBYSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRU0sY0FBYyxDQUFDLFFBQWtCO1FBQ3ZDLE9BQU8sYUFBYSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVNLGVBQWU7UUFDckIsT0FBTyxhQUFhLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFTyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQWdCLEVBQUUsQ0FBZ0I7UUFDeEQsT0FBTyxDQUNOLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLFFBQVE7ZUFDdEIsQ0FBQyxDQUFDLFNB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