/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable, IDisposable, Disposable } from '../common/lifecycle.js';
import { autorun, IObservable } from '../common/observable.js';
import { isFirefox } from './browser.js';
import { getWindows, sharedMutationObserver } from './dom.js';
import { mainWindow } from './window.js';

const globalStylesheets = new Map<HTMLStyleElement /* main stylesheet */, Set<HTMLStyleElement /* aux window clones that track the main stylesheet */>>();

export function isGlobalStylesheet(node: Node): boolean {
	return globalStylesheets.has(node as HTMLStyleElement);
}

class WrappedStyleElement extends Disposable {
	private _currentCssStyle = '';
	private _styleSheet: HTMLStyleElement | undefined = undefined;

	setStyle(cssStyle: string): void {
		if (cssStyle === this._currentCssStyle) {
			return;
		}
		this._currentCssStyle = cssStyle;

		if (!this._styleSheet) {
			this._styleSheet = createStyleSheet(mainWindow.document.head, s => s.textContent = cssStyle, this._store);
		} else {
			this._styleSheet.textContent = cssStyle;
		}
	}

	override dispose(): void {
		super.dispose();

		this._styleSheet = undefined;
	}
}

export function createStyleSheet(container: HTMLElement = mainWindow.document.head, beforeAppend?: (style: HTMLStyleElement) => void, disposableStore?: DisposableStore): HTMLStyleElement {
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
		const globalStylesheetClones = new Set<HTMLStyleElement>();
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

export function cloneGlobalStylesheets(targetWindow: Window): IDisposable {
	const disposables = new DisposableStore();

	for (const [globalStylesheet, clonedGlobalStylesheets] of globalStylesheets) {
		disposables.add(cloneGlobalStyleSheet(globalStylesheet, clonedGlobalStylesheets, targetWindow));
	}

	return disposables;
}

function cloneGlobalStyleSheet(globalStylesheet: HTMLStyleElement, globalStylesheetClones: Set<HTMLStyleElement>, targetWindow: Window): IDisposable {
	const disposables = new DisposableStore();

	const clone = globalStylesheet.cloneNode(true) as HTMLStyleElement;
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

let _sharedStyleSheet: HTMLStyleElement | null = null;
function getSharedStyleSheet(): HTMLStyleElement {
	if (!_sharedStyleSheet) {
		_sharedStyleSheet = createStyleSheet();
	}
	return _sharedStyleSheet;
}

export function createCSSRule(selector: string, cssText: string, style = getSharedStyleSheet()): CSSRule | undefined {
	if (!style || !cssText) {
		return undefined;
	}

	const sheet = style.sheet;
	sheet?.insertRule(`${selector} {${cssText}}`, 0);
	const insertedRule = sheet?.cssRules[0];

	// Apply rule also to all cloned global stylesheets
	for (const clonedGlobalStylesheet of globalStylesheets.get(style) ?? []) {
		createCSSRule(selector, cssText, clonedGlobalStylesheet);
	}

	return insertedRule;
}

/**
 * Removes rules previously obtained from {@link createCSSRule} in a single pass over `style`.
 * Matching on rule identity keeps removing K rules out of N at O(N + K), while
 * {@link removeCSSRulesContainingSelector} costs O(N) for every single call.
 */
export function removeCSSRules(rulesToRemove: ReadonlySet<CSSRule>, style = getSharedStyleSheet()): void {
	if (!style || rulesToRemove.size === 0) {
		return;
	}

	const sheet = style.sheet;
	if (!sheet) {
		return;
	}

	const rules = sheet.cssRules;
	const toDelete: number[] = [];
	const removedRules: CSSRule[] = [];
	for (let i = rules.length - 1; i >= 0; i--) {
		const rule = rules[i];
		if (rulesToRemove.has(rule)) {
			toDelete.push(i);
			removedRules.push(rule);
		}
	}

	if (toDelete.length === 0) {
		return;
	}

	// Cloned global stylesheets hold their own `CSSRule` objects, so they have to be matched by
	// text, which must be read before the rules are detached from `sheet`.
	const clonedGlobalStylesheets = globalStylesheets.get(style);
	const removedCssTexts = clonedGlobalStylesheets?.size ? new Set(removedRules.map(rule => rule.cssText)) : undefined;

	// `toDelete` is descending, so the indices still to be deleted stay valid
	for (const index of toDelete) {
		sheet.deleteRule(index);
	}

	if (!removedCssTexts || !clonedGlobalStylesheets) {
		return;
	}

	for (const clonedGlobalStylesheet of clonedGlobalStylesheets) {
		const clonedSheet = clonedGlobalStylesheet.sheet;
		if (!clonedSheet) {
			continue;
		}
		const clonedRules = clonedSheet.cssRules;
		for (let i = clonedRules.length - 1; i >= 0; i--) {
			if (removedCssTexts.has(clonedRules[i].cssText)) {
				clonedSheet.deleteRule(i);
			}
		}
	}
}

export function removeCSSRulesContainingSelector(ruleName: string, style = getSharedStyleSheet()): void {
	if (!style) {
		return;
	}

	const rules = style.sheet?.cssRules ?? [];
	const toDelete: number[] = [];
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

function isCSSStyleRule(rule: CSSRule): rule is CSSStyleRule {
	return typeof (rule as CSSStyleRule).selectorText === 'string';
}

export function createStyleSheetFromObservable(css: IObservable<string>): IDisposable {
	const store = new DisposableStore();
	const w = store.add(new WrappedStyleElement());
	store.add(autorun(reader => {
		w.setStyle(css.read(reader));
	}));
	return store;
}
