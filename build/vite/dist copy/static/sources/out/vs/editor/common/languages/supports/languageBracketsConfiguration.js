/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CachedFunction } from '../../../../base/common/cache.js';
import { createBracketOrRegExp } from './richEditBrackets.js';
/**
 * Captures all bracket related configurations for a single language.
 * Immutable.
*/
export class LanguageBracketsConfiguration {
    constructor(languageId, config) {
        this.languageId = languageId;
        const bracketPairs = config.brackets ? filterValidBrackets(config.brackets) : [];
        const openingBracketInfos = new CachedFunction((bracket) => {
            const closing = new Set();
            return {
                info: new OpeningBracketKind(this, bracket, closing),
                closing,
            };
        });
        const closingBracketInfos = new CachedFunction((bracket) => {
            const opening = new Set();
            const openingColorized = new Set();
            return {
                info: new ClosingBracketKind(this, bracket, opening, openingColorized),
                opening,
                openingColorized,
            };
        });
        for (const [open, close] of bracketPairs) {
            const opening = openingBracketInfos.get(open);
            const closing = closingBracketInfos.get(close);
            opening.closing.add(closing.info);
            closing.opening.add(opening.info);
        }
        // Treat colorized brackets as brackets, and mark them as colorized.
        const colorizedBracketPairs = config.colorizedBracketPairs
            ? filterValidBrackets(config.colorizedBracketPairs)
            // If not configured: Take all brackets except `<` ... `>`
            // Many languages set < ... > as bracket pair, even though they also use it as comparison operator.
            // This leads to problems when colorizing this bracket, so we exclude it if not explicitly configured otherwise.
            // https://github.com/microsoft/vscode/issues/132476
            : bracketPairs.filter((p) => !(p[0] === '<' && p[1] === '>'));
        for (const [open, close] of colorizedBracketPairs) {
            const opening = openingBracketInfos.get(open);
            const closing = closingBracketInfos.get(close);
            opening.closing.add(closing.info);
            closing.openingColorized.add(opening.info);
            closing.opening.add(opening.info);
        }
        this._openingBrackets = new Map([...openingBracketInfos.cachedValues].map(([k, v]) => [k, v.info]));
        this._closingBrackets = new Map([...closingBracketInfos.cachedValues].map(([k, v]) => [k, v.info]));
    }
    /**
     * No two brackets have the same bracket text.
    */
    get openingBrackets() {
        return [...this._openingBrackets.values()];
    }
    /**
     * No two brackets have the same bracket text.
    */
    get closingBrackets() {
        return [...this._closingBrackets.values()];
    }
    getOpeningBracketInfo(bracketText) {
        return this._openingBrackets.get(bracketText);
    }
    getClosingBracketInfo(bracketText) {
        return this._closingBrackets.get(bracketText);
    }
    getBracketInfo(bracketText) {
        return this.getOpeningBracketInfo(bracketText) || this.getClosingBracketInfo(bracketText);
    }
    getBracketRegExp(options) {
        const brackets = Array.from([...this._openingBrackets.keys(), ...this._closingBrackets.keys()]);
        return createBracketOrRegExp(brackets, options);
    }
}
function filterValidBrackets(bracketPairs) {
    return bracketPairs.filter(([open, close]) => open !== '' && close !== '');
}
export class BracketKindBase {
    constructor(config, bracketText) {
        this.config = config;
        this.bracketText = bracketText;
    }
    get languageId() {
        return this.config.languageId;
    }
}
export class OpeningBracketKind extends BracketKindBase {
    constructor(config, bracketText, openedBrackets) {
        super(config, bracketText);
        this.openedBrackets = openedBrackets;
        this.isOpeningBracket = true;
    }
}
export class ClosingBracketKind extends BracketKindBase {
    constructor(config, bracketText, 
    /**
     * Non empty array of all opening brackets this bracket closes.
    */
    openingBrackets, openingColorizedBrackets) {
        super(config, bracketText);
        this.openingBrackets = openingBrackets;
        this.openingColorizedBrackets = openingColorizedBrackets;
        this.isOpeningBracket = false;
    }
    /**
     * Checks if this bracket closes the given other bracket.
     * If the bracket infos come from different configurations, this method will return false.
    */
    closes(other) {
        if (other['config'] !== this.config) {
            return false;
        }
        return this.openingBrackets.has(other);
    }
    closesColorized(other) {
        if (other['config'] !== this.config) {
            return false;
        }
        return this.openingColorizedBrackets.has(other);
    }
    getOpeningBrackets() {
        return [...this.openingBrackets];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy9sYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFOUQ7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLDZCQUE2QjtJQUl6QyxZQUNpQixVQUFrQixFQUNsQyxNQUE2QjtRQURiLGVBQVUsR0FBVixVQUFVLENBQVE7UUFHbEMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDakYsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLGNBQWMsQ0FBQyxDQUFDLE9BQWUsRUFBRSxFQUFFO1lBQ2xFLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1lBRTlDLE9BQU87Z0JBQ04sSUFBSSxFQUFFLElBQUksa0JBQWtCLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUM7Z0JBQ3BELE9BQU87YUFDUCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLG1CQUFtQixHQUFHLElBQUksY0FBYyxDQUFDLENBQUMsT0FBZSxFQUFFLEVBQUU7WUFDbEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQXNCLENBQUM7WUFDOUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsRUFBc0IsQ0FBQztZQUN2RCxPQUFPO2dCQUNOLElBQUksRUFB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