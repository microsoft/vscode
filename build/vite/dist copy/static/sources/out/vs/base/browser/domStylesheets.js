/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore, toDisposable, Disposable } from '../common/lifecycle.js';
import { autorun } from '../common/observable.js';
import { isFirefox } from './browser.js';
import { getWindows, sharedMutationObserver } from './dom.js';
import { mainWindow } from './window.js';
const globalStylesheets = new Map();
export function isGlobalStylesheet(node) {
    return globalStylesheets.has(node);
}
class WrappedStyleElement extends Disposable {
    constructor() {
        super(...arguments);
        this._currentCssStyle = '';
        this._styleSheet = undefined;
    }
    setStyle(cssStyle) {
        if (cssStyle === this._currentCssStyle) {
            return;
        }
        this._currentCssStyle = cssStyle;
        if (!this._styleSheet) {
            this._styleSheet = createStyleSheet(mainWindow.document.head, s => s.textContent = cssStyle, this._store);
        }
        else {
            this._styleSheet.textContent = cssStyle;
        }
    }
    dispose() {
        super.dispose();
        this._styleSheet = undefined;
    }
}
export function createStyleSheet(container = mainWindow.document.head, beforeAppend, disposableStore) {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.media = 'screen';
    beforeAppend?.(style);
    container.appendChild(style);
    if (disposableStore) {
        disposableStore.add(toDisposable(() => style.remove()));
    }
    // With <head> as container, the stylesheet becomes global and is tracked
    // to support auxiliary windows to clone the stylesheet.
    if (container === mainWindow.document.head) {
        const globalStylesheetClones = new Set();
        globalStylesheets.set(style, globalStylesheetClones);
        if (disposableStore) {
            disposableStore.add(toDisposable(() => globalStylesheets.delete(style)));
        }
        for (const { window: targetWindow, disposables } of getWindows()) {
            if (targetWindow === mainWindow) {
                continue; // main window is already tracked
            }
            const cloneDisposable = disposables.add(cloneGlobalStyleSheet(style, globalStylesheetClones, targetWindow));
            disposableStore?.add(cloneDisposable);
        }
    }
    return style;
}
export function cloneGlobalStylesheets(targetWindow) {
    const disposables = new DisposableStore();
    for (const [globalStylesheet, clonedGlobalStylesheets] of globalStylesheets) {
        disposables.add(cloneGlobalStyleSheet(globalStylesheet, clonedGlobalStylesheets, targetWindow));
    }
    return disposables;
}
function cloneGlobalStyleSheet(globalStylesheet, globalStylesheetClones, targetWindow) {
    const disposables = new DisposableStore();
    const clone = globalStylesheet.cloneNode(true);
    targetWindow.document.head.appendChild(clone);
    disposables.add(toDisposable(() => clone.remove()));
    for (const rule of globalStylesheet.sheet?.cssRules ?? []) {
        clone.sheet?.insertRule(rule.cssText, clone.sheet?.cssRules.length);
    }
    disposables.add(sharedMutationObserver.observe(globalStylesheet, disposables, { childList: true, subtree: isFirefox, characterData: isFirefox })(() => {
        clone.textContent = globalStylesheet.textContent;
    }));
    globalStylesheetClones.add(clone);
    disposables.add(toDisposable(() => globalStylesheetClones.delete(clone)));
    return disposables;
}
let _sharedStyleSheet = null;
function getSharedStyleSheet() {
    if (!_sharedStyleSheet) {
        _sharedStyleSheet = createStyleSheet();
    }
    return _sharedStyleSheet;
}
export function createCSSRule(selector, cssText, style = getSharedStyleSheet()) {
    if (!style || !cssText) {
        return;
    }
    style.sheet?.insertRule(`${selector} {${cssText}}`, 0);
    // Apply rule also to all cloned global stylesheets
    for (const clonedGlobalStylesheet of globalStylesheets.get(style) ?? []) {
        createCSSRule(selector, cssText, clonedGlobalStylesheet);
    }
}
export function removeCSSRulesContainingSelector(ruleName, style = getSharedStyleSheet()) {
    if (!style) {
        return;
    }
    const rules = style.sheet?.cssRules ?? [];
    const toDelete = [];
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (isCSSStyleRule(rule) && rule.selectorText.indexOf(ruleName) !== -1) {
            toDelete.push(i);
        }
    }
    for (let i = toDelete.length - 1; i >= 0; i--) {
        style.sheet?.deleteRule(toDelete[i]);
    }
    // Remove rules also from all cloned global stylesheets
    for (const clonedGlobalStylesheet of globalStylesheets.get(style) ?? []) {
        removeCSSRulesContainingSelector(ruleName, clonedGlobalStylesheet);
    }
}
function isCSSStyleRule(rule) {
    return typeof rule.selectorText === 'string';
}
export function createStyleSheetFromObservable(css) {
    const store = new DisposableStore();
    const w = store.add(new WrappedStyleElement());
    store.add(autorun(reader => {
        w.setStyle(css.read(reader));
    }));
    return store;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tU3R5bGVzaGVldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQWUsVUFBVSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLHlCQUF5QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDekMsT0FBTyxFQUFFLFVBQVUsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRXpDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQXdILENBQUM7QUFFMUosTUFBTSxVQUFVLGtCQUFrQixDQUFDLElBQVU7SUFDNUMsT0FBTyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBd0IsQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRCxNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFBNUM7O1FBQ1MscUJBQWdCLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLGdCQUFXLEdBQWlDLFNBQVMsQ0FBQztJQW9CL0QsQ0FBQztJQWxCQSxRQUFRLENBQUMsUUFBZ0I7UUFDeEIsSUFBSSxRQUFRLEtBQUssSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsUUFBUSxDQUFDO1FBRWpDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLFdBQVcsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFD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