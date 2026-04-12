/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { BracketAstNode } from './ast.js';
import { toLength } from './length.js';
import { identityKeyProvider, SmallImmutableSet } from './smallImmutableSet.js';
import { Token } from './tokenizer.js';
export class BracketTokens {
    static createFromLanguage(configuration, denseKeyProvider) {
        function getId(bracketInfo) {
            return denseKeyProvider.getKey(`${bracketInfo.languageId}:::${bracketInfo.bracketText}`);
        }
        const map = new Map();
        for (const openingBracket of configuration.bracketsNew.openingBrackets) {
            const length = toLength(0, openingBracket.bracketText.length);
            const openingTextId = getId(openingBracket);
            const bracketIds = SmallImmutableSet.getEmpty().add(openingTextId, identityKeyProvider);
            map.set(openingBracket.bracketText, new Token(length, 1 /* TokenKind.OpeningBracket */, openingTextId, bracketIds, BracketAstNode.create(length, openingBracket, bracketIds)));
        }
        for (const closingBracket of configuration.bracketsNew.closingBrackets) {
            const length = toLength(0, closingBracket.bracketText.length);
            let bracketIds = SmallImmutableSet.getEmpty();
            const closingBrackets = closingBracket.getOpeningBrackets();
            for (const bracket of closingBrackets) {
                bracketIds = bracketIds.add(getId(bracket), identityKeyProvider);
            }
            map.set(closingBracket.bracketText, new Token(length, 2 /* TokenKind.ClosingBracket */, getId(closingBrackets[0]), bracketIds, BracketAstNode.create(length, closingBracket, bracketIds)));
        }
        return new BracketTokens(map);
    }
    constructor(map) {
        this.map = map;
        this.hasRegExp = false;
        this._regExpGlobal = null;
    }
    getRegExpStr() {
        if (this.isEmpty) {
            return null;
        }
        else {
            const keys = [...this.map.keys()];
            keys.sort();
            keys.reverse();
            return keys.map(k => prepareBracketForRegExp(k)).join('|');
        }
    }
    /**
     * Returns null if there is no such regexp (because there are no brackets).
    */
    get regExpGlobal() {
        if (!this.hasRegExp) {
            const regExpStr = this.getRegExpStr();
            this._regExpGlobal = regExpStr ? new RegExp(regExpStr, 'gi') : null;
            this.hasRegExp = true;
        }
        return this._regExpGlobal;
    }
    getToken(value) {
        return this.map.get(value.toLowerCase());
    }
    findClosingTokenText(openingBracketIds) {
        for (const [closingText, info] of this.map) {
            if (info.kind === 2 /* TokenKind.ClosingBracket */ && info.bracketIds.intersects(openingBracketIds)) {
                return closingText;
            }
        }
        return undefined;
    }
    get isEmpty() {
        return this.map.size === 0;
    }
}
function prepareBracketForRegExp(str) {
    let escaped = escapeRegExpCharacters(str);
    // These bracket pair delimiters start or end with letters
    // see https://github.com/microsoft/vscode/issues/132162 https://github.com/microsoft/vscode/issues/150440
    if (/^[\w ]+/.test(str)) {
        escaped = `\\b${escaped}`;
    }
    if (/[\w ]+$/.test(str)) {
        escaped = `${escaped}\\b`;
    }
    return escaped;
}
export class LanguageAgnosticBracketTokens {
    constructor(denseKeyProvider, getLanguageConfiguration) {
        this.denseKeyProvider = denseKeyProvider;
        this.getLanguageConfiguration = getLanguageConfiguration;
        this.languageIdToBracketTokens = new Map();
    }
    didLanguageChange(languageId) {
        // Report a change whenever the language configuration updates.
        return this.languageIdToBracketTokens.has(languageId);
    }
    getSingleLanguageBracketTokens(languageId) {
        let singleLanguageBracketTokens = this.languageIdToBracketTokens.get(languageId);
        if (!singleLanguageBracketTokens) {
            singleLanguageBracketTokens = BracketTokens.createFromLanguage(this.getLanguageConfiguration(languageId), this.denseKeyProvider);
            this.languageIdToBracketTokens.set(languageId, singleLanguageBracketTokens);
        }
        return singleLanguageBracketTokens;
    }
    getToken(value, languageId) {
        const singleLanguageBracketTokens = this.getSingleLanguageBracketTokens(languageId);
        return singleLanguageBracketTokens.getToken(value);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhY2tldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzVHJlZS9icmFja2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUcvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQzFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDdkMsT0FBTyxFQUFvQixtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xHLE9BQU8sRUFBb0IsS0FBSyxFQUFhLE1BQU0sZ0JBQWdCLENBQUM7QUFFcEUsTUFBTSxPQUFPLGFBQWE7SUFDekIsTUFBTSxDQUFDLGtCQUFrQixDQUFDLGFBQTRDLEVBQUUsZ0JBQTBDO1FBQ2pILFNBQVMsS0FBSyxDQUFDLFdBQXdCO1lBQ3RDLE9BQU8sZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDLFVBQVUsTUFBTSxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUMxRixDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQWlCLENBQUM7UUFDckMsS0FBSyxNQUFNLGNBQWMsSUFBSSxhQUFhLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3hFLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5RCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDNUMsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsUUFB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