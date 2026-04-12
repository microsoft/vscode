/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, getActiveDocument, getActiveWindow } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import './media/decorationCssRuleExtractor.css';
/**
 * Extracts CSS rules that would be applied to certain decoration classes.
 */
export class DecorationCssRuleExtractor extends Disposable {
    constructor() {
        super();
        this._ruleCache = new Map();
        this._cssVariableCache = new Map();
        this._container = $('div.monaco-decoration-css-rule-extractor');
        this._dummyElement = $('span');
        this._container.appendChild(this._dummyElement);
        this._register(toDisposable(() => this._container.remove()));
    }
    getStyleRules(canvas, decorationClassName) {
        // Check cache
        const existing = this._ruleCache.get(decorationClassName);
        if (existing) {
            return existing;
        }
        // Set up DOM
        this._dummyElement.className = decorationClassName;
        canvas.appendChild(this._container);
        // Get rules
        const rules = this._getStyleRules(decorationClassName);
        this._ruleCache.set(decorationClassName, rules);
        // Tear down DOM
        canvas.removeChild(this._container);
        return rules;
    }
    _getStyleRules(className) {
        // Iterate through all stylesheets and imported stylesheets to find matching rules
        const rules = [];
        const doc = getActiveDocument();
        const stylesheets = [...doc.styleSheets];
        // className can be space-separated (e.g., 'ghost-text-decoration syntax-highlighted')
        // We need to search for each individual class
        const classNames = className.split(' ').filter(c => c.length > 0);
        for (let i = 0; i < stylesheets.length; i++) {
            const stylesheet = stylesheets[i];
            this._collectMatchingRules(stylesheet.cssRules, classNames, rules);
        }
        return rules;
    }
    _collectMatchingRules(cssRules, classNames, result) {
        for (const rule of cssRules) {
            if (rule instanceof CSSImportRule) {
                if (rule.styleSheet) {
                    this._collectMatchingRules(rule.styleSheet.cssRules, classNames, result);
                }
            }
            else if (rule instanceof CSSStyleRule) {
                // Note that originally `.matches(rule.selectorText)` was used but this would
                // not pick up pseudo-classes which are important to determine support of the
                // returned styles.
                //
                // Since a selector could contain a class name lookup that is simple a prefix of
                // the class name we are looking for, we need to also check the character after
                // it.
                for (const className of classNames) {
                    const searchTerm = `.${className}`;
                    const index = rule.selectorText.indexOf(searchTerm);
                    if (index !== -1) {
                        const endOfResult = index + searchTerm.length;
                        if (rule.selectorText.length === endOfResult || rule.selectorText.substring(endOfResult, endOfResult + 1).match(/[ :.]/)) {
                            result.push(rule);
                            break; // Don't add the same rule multiple times
                        }
                    }
                }
                // Recursively check nested rules (CSS nesting)
                if (rule.cssRules?.length) {
                    this._collectMatchingRules(rule.cssRules, classNames, result);
                }
            }
        }
    }
    /**
     * Resolves a CSS variable to its computed value using the container element.
     */
    resolveCssVariable(canvas, variableName) {
        let result = this._cssVariableCache.get(variableName);
        if (result === undefined) {
            canvas.appendChild(this._container);
            result = getActiveWindow().getComputedStyle(this._container).getPropertyValue(variableName).trim();
            canvas.removeChild(this._container);
            this._cssVariableCache.set(variableName, result);
        }
        return result;
    }
    /**
     * Clears all cached CSS rules and CSS variable values. This should be called when the theme
     * changes to ensure fresh values are computed.
     */
    clear() {
        this._ruleCache.clear();
        this._cssVariableCache.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvY3NzL2RlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLHdDQUF3QyxDQUFDO0FBRWhEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLDBCQUEyQixTQUFRLFVBQVU7SUFPekQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUpELGVBQVUsR0FBK0MsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNuRSxzQkFBaUIsR0FBcUQsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUt2RixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9CLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVoRCxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsYUFBYSxDQUFDLE1BQW1CLEVBQUUsbUJBQTJCO1FBQzdELGNBQWM7UUFDZCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzFELElBQUksUUFBUSxF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