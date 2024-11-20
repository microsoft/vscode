/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveDocument } from '../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';

export class DecorationCssRuleExtractor extends Disposable {
	private _container: HTMLElement;

	private _ruleCache: Map</* className */string, CSSStyleRule[]> = new Map();

	constructor() {
		super();
		this._container = $('div.monaco-css-rule-extractor');
		this._container.style.visibility = 'hidden';
		this._register(toDisposable(() => this._container.remove()));
	}

	getStyleRules(canvas: HTMLElement, decorationClassName: string): CSSStyleRule[] {
		const existing = this._ruleCache.get(decorationClassName);
		if (existing) {
			return existing;
		}
		const dummyElement = $(`span.${decorationClassName}`);
		this._container.appendChild(dummyElement);
		canvas.appendChild(this._container);

		const rules = this._getStyleRules(canvas, dummyElement, decorationClassName);
		this._ruleCache.set(decorationClassName, rules);

		canvas.removeChild(this._container);
		this._container.removeChild(dummyElement);

		return rules;
	}

	private _getStyleRules(canvas: HTMLElement, element: HTMLElement, className: string) {
		// Iterate through all stylesheets and imported stylesheets to find matching rules
		const rules = [];
		const doc = getActiveDocument();
		const stylesheets = [...doc.styleSheets];
		for (let i = 0; i < stylesheets.length; i++) {
			const stylesheet = stylesheets[i];
			for (const rule of stylesheet.cssRules) {
				if (rule instanceof CSSImportRule) {
					if (rule.styleSheet) {
						stylesheets.push(rule.styleSheet);
					}
				} else if (rule instanceof CSSStyleRule) {
					if (element.matches(rule.selectorText) && rule.selectorText.includes(`.${className}`)) {
						rules.push(rule);
					}
				}
			}
		}

		return rules;
	}
}
