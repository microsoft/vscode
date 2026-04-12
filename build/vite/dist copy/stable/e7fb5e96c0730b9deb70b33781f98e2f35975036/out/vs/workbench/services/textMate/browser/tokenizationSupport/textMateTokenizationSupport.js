/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { TokenMetadata } from '../../../../../editor/common/encodedTokenAttributes.js';
import { EncodedTokenizationResult } from '../../../../../editor/common/languages.js';
export class TextMateTokenizationSupport extends Disposable {
    get onDidEncounterLanguage() { return this._onDidEncounterLanguage.event; }
    constructor(_grammar, _initialState, _containsEmbeddedLanguages, _createBackgroundTokenizer, _backgroundTokenizerShouldOnlyVerifyTokens, _reportTokenizationTime, _reportSlowTokenization) {
        super();
        this._grammar = _grammar;
        this._initialState = _initialState;
        this._containsEmbeddedLanguages = _containsEmbeddedLanguages;
        this._createBackgroundTokenizer = _createBackgroundTokenizer;
        this._backgroundTokenizerShouldOnlyVerifyTokens = _backgroundTokenizerShouldOnlyVerifyTokens;
        this._reportTokenizationTime = _reportTokenizationTime;
        this._reportSlowTokenization = _reportSlowTokenization;
        this._seenLanguages = [];
        this._onDidEncounterLanguage = this._register(new Emitter());
    }
    get backgroundTokenizerShouldOnlyVerifyTokens() {
        return this._backgroundTokenizerShouldOnlyVerifyTokens();
    }
    getInitialState() {
        return this._initialState;
    }
    tokenize(line, hasEOL, state) {
        throw new Error('Not supported!');
    }
    createBackgroundTokenizer(textModel, store) {
        if (this._createBackgroundTokenizer) {
            return this._createBackgroundTokenizer(textModel, store);
        }
        return undefined;
    }
    tokenizeEncoded(line, hasEOL, state) {
        const isRandomSample = Math.random() * 10_000 < 1;
        const shouldMeasure = this._reportSlowTokenization || isRandomSample;
        const sw = shouldMeasure ? new StopWatch(true) : undefined;
        const textMateResult = this._grammar.tokenizeLine2(line, state, 500);
        if (shouldMeasure) {
            const timeMS = sw.elapsed();
            if (isRandomSample || timeMS > 32) {
                this._reportTokenizationTime(timeMS, line.length, isRandomSample);
            }
        }
        if (textMateResult.stoppedEarly) {
            console.warn(`Time limit reached when tokenizing line: ${line.substring(0, 100)}`);
            // return the state at the beginning of the line
            return new EncodedTokenizationResult(textMateResult.tokens, textMateResult.fonts, state);
        }
        if (this._containsEmbeddedLanguages) {
            const seenLanguages = this._seenLanguages;
            const tokens = textMateResult.tokens;
            // Must check if any of the embedded languages was hit
            for (let i = 0, len = (tokens.length >>> 1); i < len; i++) {
                const metadata = tokens[(i << 1) + 1];
                const languageId = TokenMetadata.getLanguageId(metadata);
                if (!seenLanguages[languageId]) {
                    seenLanguages[languageId] = true;
                    this._onDidEncounterLanguage.fire(languageId);
                }
            }
        }
        let endState;
        // try to save an object if possible
        if (state.equals(textMateResult.ruleStack)) {
            endState = state;
        }
        else {
            endState = textMateResult.ruleStack;
        }
        return new EncodedTokenizationResult(textMateResult.tokens, textMateResult.fonts, endState);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1hdGVUb2tlbml6YXRpb25TdXBwb3J0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRNYXRlL2Jyb3dzZXIvdG9rZW5pemF0aW9uU3VwcG9ydC90ZXh0TWF0ZVRva2VuaXphdGlvblN1cHBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSx5QkFBeUIsRUFBd0csTUFBTSwyQ0FBMkMsQ0FBQztBQUk1TCxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQUcxRCxJQUFXLHNCQUFzQixLQUF3QixPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRXJHLFlBQ2tCLFFBQWtCLEVBQ2xCLGFBQXlCLEVBQ3pCLDBCQUFtQyxFQUNuQywwQkFBK0ksRUFDL0ksMENBQXlELEVBQ3pELHVCQUE4RixFQUM5Rix1QkFBZ0M7UUFFakQsS0FBSyxFQUFFLENBQUM7UUFSUyxhQUFRLEdBQVIsUUFBUSxDQUFVO1FBQ2xCLGtCQUFhLEdBQWIsYUFBYSxDQUFZO1FBQ3pCLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBUztRQUNuQywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQXFIO1FBQy9JLCtDQUEwQyxHQUExQywwQ0FBMEMsQ0FBZTtRQUN6RCw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQXVFO1FBQzlGLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBUztRQVhq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