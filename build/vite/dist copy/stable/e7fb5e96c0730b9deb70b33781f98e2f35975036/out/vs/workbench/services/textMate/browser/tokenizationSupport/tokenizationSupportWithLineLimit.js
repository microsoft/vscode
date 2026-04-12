/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { nullTokenizeEncoded } from '../../../../../editor/common/languages/nullTokenize.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { keepObserved } from '../../../../../base/common/observable.js';
export class TokenizationSupportWithLineLimit extends Disposable {
    get backgroundTokenizerShouldOnlyVerifyTokens() {
        return this._actual.backgroundTokenizerShouldOnlyVerifyTokens;
    }
    constructor(_encodedLanguageId, _actual, disposable, _maxTokenizationLineLength) {
        super();
        this._encodedLanguageId = _encodedLanguageId;
        this._actual = _actual;
        this._maxTokenizationLineLength = _maxTokenizationLineLength;
        this._register(keepObserved(this._maxTokenizationLineLength));
        this._register(disposable);
    }
    getInitialState() {
        return this._actual.getInitialState();
    }
    tokenize(line, hasEOL, state) {
        throw new Error('Not supported!');
    }
    tokenizeEncoded(line, hasEOL, state) {
        // Do not attempt to tokenize if a line is too long
        if (line.length >= this._maxTokenizationLineLength.get()) {
            return nullTokenizeEncoded(this._encodedLanguageId, state);
        }
        return this._actual.tokenizeEncoded(line, hasEOL, state);
    }
    createBackgroundTokenizer(textModel, store) {
        if (this._actual.createBackgroundTokenizer) {
            return this._actual.createBackgroundTokenizer(textModel, store);
        }
        else {
            return undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemF0aW9uU3VwcG9ydFdpdGhMaW5lTGltaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dE1hdGUvYnJvd3Nlci90b2tlbml6YXRpb25TdXBwb3J0L3Rva2VuaXphdGlvblN1cHBvcnRXaXRoTGluZUxpbWl0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFckYsTUFBTSxPQUFPLGdDQUFpQyxTQUFRLFVBQVU7SUFDL0QsSUFBSSx5Q0FBeUM7UUFDNUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLHlDQUF5QyxDQUFDO0lBQy9ELENBQUM7SUFFRCxZQUNrQixrQkFBOEIsRUFDOUIsT0FBNkIsRUFDOUMsVUFBdUIsRUFDTiwwQkFBK0M7UUFFaEUsS0FBSyxFQUFFLENBQUM7UUFMUyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQVk7UUFDOUIsWUFBTyxHQUFQLE9BQU8sQ0FBc0I7UUFFN0IsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUFxQjtRQUloRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELGVBQWU7UUFDZCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVELFFBQVEsQ0FBQyxJQUFZLEVBQUUsTUFBZSxFQUFFLEtBQWE7UUFDcEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxlQUFlLENBQUMsSUFBWSxFQUFFLE1BQWUsRUFBRSxLQUFhO1FBQzNELG1EQUFtRDtRQUNuRCxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDMUQsT0FBTyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQseUJBQXlCLENBQUMsU0FBcUIsRUFBRSxLQUFtQztRQUNuRixJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMseUJBQXlCLEVBQUUsQ0FBQztZQUM1QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9