/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function createScopedLineTokens(context, offset) {
    const tokenCount = context.getCount();
    const tokenIndex = context.findTokenIndexAtOffset(offset);
    const desiredLanguageId = context.getLanguageId(tokenIndex);
    let lastTokenIndex = tokenIndex;
    while (lastTokenIndex + 1 < tokenCount && context.getLanguageId(lastTokenIndex + 1) === desiredLanguageId) {
        lastTokenIndex++;
    }
    let firstTokenIndex = tokenIndex;
    while (firstTokenIndex > 0 && context.getLanguageId(firstTokenIndex - 1) === desiredLanguageId) {
        firstTokenIndex--;
    }
    return new ScopedLineTokens(context, desiredLanguageId, firstTokenIndex, lastTokenIndex + 1, context.getStartOffset(firstTokenIndex), context.getEndOffset(lastTokenIndex));
}
export class ScopedLineTokens {
    constructor(actual, languageId, firstTokenIndex, lastTokenIndex, firstCharOffset, lastCharOffset) {
        this._scopedLineTokensBrand = undefined;
        this._actual = actual;
        this.languageId = languageId;
        this._firstTokenIndex = firstTokenIndex;
        this._lastTokenIndex = lastTokenIndex;
        this.firstCharOffset = firstCharOffset;
        this._lastCharOffset = lastCharOffset;
        this.languageIdCodec = actual.languageIdCodec;
    }
    getLineContent() {
        const actualLineContent = this._actual.getLineContent();
        return actualLineContent.substring(this.firstCharOffset, this._lastCharOffset);
    }
    getLineLength() {
        return this._lastCharOffset - this.firstCharOffset;
    }
    getActualLineContentBefore(offset) {
        const actualLineContent = this._actual.getLineContent();
        return actualLineContent.substring(0, this.firstCharOffset + offset);
    }
    getTokenCount() {
        return this._lastTokenIndex - this._firstTokenIndex;
    }
    findTokenIndexAtOffset(offset) {
        return this._actual.findTokenIndexAtOffset(offset + this.firstCharOffset) - this._firstTokenIndex;
    }
    getStandardTokenType(tokenIndex) {
        return this._actual.getStandardTokenType(tokenIndex + this._firstTokenIndex);
    }
    toIViewLineTokens() {
        return this._actual.sliceAndInflate(this.firstCharOffset, this._lastCharOffset, 0);
    }
}
var IgnoreBracketsInTokens;
(function (IgnoreBracketsInTokens) {
    IgnoreBracketsInTokens[IgnoreBracketsInTokens["value"] = 3] = "value";
})(IgnoreBracketsInTokens || (IgnoreBracketsInTokens = {}));
export function ignoreBracketsInToken(standardTokenType) {
    return (standardTokenType & 3 /* IgnoreBracketsInTokens.value */) !== 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VwcG9ydHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLFVBQVUsc0JBQXNCLENBQUMsT0FBbUIsRUFBRSxNQUFjO0lBQ3pFLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN0QyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRTVELElBQUksY0FBYyxHQUFHLFVBQVUsQ0FBQztJQUNoQyxPQUFPLGNBQWMsR0FBRyxDQUFDLEdBQUcsVUFBVSxJQUFJLE9BQU8sQ0FBQyxhQUFhLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxLQUFLLGlCQUFpQixFQUFFLENBQUM7UUFDM0csY0FBYyxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksZUFBZSxHQUFHLFVBQVUsQ0FBQztJQUNqQyxPQUFPLGVBQWUsR0FBRyxDQUFDLElBQUksT0FBTyxDQUFDLGFBQWEsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztRQUNoRyxlQUFlLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBRUQsT0FBTyxJQUFJLGdCQUFnQixDQUMxQixPQUFPLEVBQ1AsaUJBQWlCLEVBQ2pCLGVBQWUsRUFDZixjQUFjLEdBQUcsQ0FBQyxFQUNsQixPQUFPLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxFQUN2QyxPQUFPLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUNwQyxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sT0FBTyxnQkFBZ0I7SUFXNUIsWUFDQyxNQUFrQixFQUNsQixVQUFrQixFQUNsQixlQUF1QixFQUN2QixjQUFzQixFQUN0QixlQUF1QixFQUN2QixjQUFzQjtRQWhCdkIsMkJBQXNCLEdBQVMsU0FBUyxDQUFDO1FBa0J4QyxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUN0QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDLGVBQWUsQ0FBQztJQUMvQyxDQUFDO0lBRU0sY0FBYztRQUNwQixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDeEQsT0FBTyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQUVNLGFBQWE7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDcEQsQ0FBQztJQUVNLDBCQUEwQixDQUFDLE1BQWM7UUFDL0MsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3hELE9BQU8saUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsZUFBZSxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFTSxhQUFhO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDckQsQ0FBQztJQUVNLHNCQUFzQixDQUFDLE1BQWM7UUFDM0MsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO0lBQ25HLENBQUM7SUFFTSxvQkFBb0IsQ0FBQyxVQUFrQjtRQUM3QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFTSxpQkFBaUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDcEYsQ0FBQztDQUNEO0FBRUQsSUFBVyxzQkFFVjtBQUZELFdBQVcsc0JBQXNCO0lBQ2hDLHFFQUFzRixDQUFBO0FBQ3ZGLENBQUMsRUFGVSxzQkFBc0IsS0FBdEIsc0JBQXNCLFFBRWhDO0FBRUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLGlCQUFvQztJQUN6RSxPQUFPLENBQUMsaUJBQWlCLHVDQUErQixDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2pFLENBQUMifQ==