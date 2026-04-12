/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function findMatchingThemeRule(theme, scopes, onlyColorRules = true) {
    for (let i = scopes.length - 1; i >= 0; i--) {
        const parentScopes = scopes.slice(0, i);
        const scope = scopes[i];
        const r = findMatchingThemeRule2(theme, scope, parentScopes, onlyColorRules);
        if (r) {
            return r;
        }
    }
    return null;
}
function findMatchingThemeRule2(theme, scope, parentScopes, onlyColorRules) {
    let result = null;
    // Loop backwards, to ensure the last most specific rule wins
    for (let i = theme.tokenColors.length - 1; i >= 0; i--) {
        const rule = theme.tokenColors[i];
        if (onlyColorRules && !rule.settings.foreground) {
            continue;
        }
        let selectors;
        if (typeof rule.scope === 'string') {
            selectors = rule.scope.split(/,/).map(scope => scope.trim());
        }
        else if (Array.isArray(rule.scope)) {
            selectors = rule.scope;
        }
        else {
            continue;
        }
        for (let j = 0, lenJ = selectors.length; j < lenJ; j++) {
            const rawSelector = selectors[j];
            const themeRule = new ThemeRule(rawSelector, rule.settings);
            if (themeRule.matches(scope, parentScopes)) {
                if (themeRule.isMoreSpecific(result)) {
                    result = themeRule;
                }
            }
        }
    }
    return result;
}
export class ThemeRule {
    constructor(rawSelector, settings) {
        this.rawSelector = rawSelector;
        this.settings = settings;
        const rawSelectorPieces = this.rawSelector.split(/ /);
        this.scope = rawSelectorPieces[rawSelectorPieces.length - 1];
        this.parentScopes = rawSelectorPieces.slice(0, rawSelectorPieces.length - 1);
    }
    matches(scope, parentScopes) {
        return ThemeRule._matches(this.scope, this.parentScopes, scope, parentScopes);
    }
    static _cmp(a, b) {
        if (a === null && b === null) {
            return 0;
        }
        if (a === null) {
            // b > a
            return -1;
        }
        if (b === null) {
            // a > b
            return 1;
        }
        if (a.scope.length !== b.scope.length) {
            // longer scope length > shorter scope length
            return a.scope.length - b.scope.length;
        }
        const aParentScopesLen = a.parentScopes.length;
        const bParentScopesLen = b.parentScopes.length;
        if (aParentScopesLen !== bParentScopesLen) {
            // more parents > less parents
            return aParentScopesLen - bParentScopesLen;
        }
        for (let i = 0; i < aParentScopesLen; i++) {
            const aLen = a.parentScopes[i].length;
            const bLen = b.parentScopes[i].length;
            if (aLen !== bLen) {
                return aLen - bLen;
            }
        }
        return 0;
    }
    isMoreSpecific(other) {
        return (ThemeRule._cmp(this, other) > 0);
    }
    static _matchesOne(selectorScope, scope) {
        const selectorPrefix = selectorScope + '.';
        if (selectorScope === scope || scope.substring(0, selectorPrefix.length) === selectorPrefix) {
            return true;
        }
        return false;
    }
    static _matches(selectorScope, selectorParentScopes, scope, parentScopes) {
        if (!this._matchesOne(selectorScope, scope)) {
            return false;
        }
        let selectorParentIndex = selectorParentScopes.length - 1;
        let parentIndex = parentScopes.length - 1;
        while (selectorParentIndex >= 0 && parentIndex >= 0) {
            if (this._matchesOne(selectorParentScopes[selectorParentIndex], parentScopes[parentIndex])) {
                selectorParentIndex--;
            }
            parentIndex--;
        }
        if (selectorParentIndex === -1) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVE1IZWxwZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dE1hdGUvY29tbW9uL1RNSGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBa0JoRyxNQUFNLFVBQVUscUJBQXFCLENBQUMsS0FBa0IsRUFBRSxNQUFnQixFQUFFLGlCQUEwQixJQUFJO0lBQ3pHLEtBQUssSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzdDLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixNQUFNLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUM3RSxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ1AsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsS0FBa0IsRUFBRSxLQUFhLEVBQUUsWUFBc0IsRUFBRSxjQUF1QjtJQUNqSCxJQUFJLE1BQU0sR0FBcUIsSUFBSSxDQUFDO0lBRXBDLDZEQUE2RDtJQUM3RCxLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDeEQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FB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