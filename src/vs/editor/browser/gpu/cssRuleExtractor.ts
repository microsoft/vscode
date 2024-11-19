/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveDocument } from '../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { ViewGpuContext } from './viewGpuContext.js';

export class CssRuleExtractor extends Disposable {
	private _container: HTMLElement;

	private _ruleCache: Map</* className */string, CSSStyleRule[]> = new Map();

	constructor(
		private readonly _viewGpuContext: ViewGpuContext,
	) {
		super();

		this._container = $('div.monaco-css-rule-extractor');
		this._container.style.visibility = 'hidden';
		const parentElement = this._viewGpuContext.canvas.domNode.parentElement;
		if (!parentElement) {
			throw new Error('No parent element found for the canvas');
		}
		parentElement.appendChild(this._container);
		this._register(toDisposable(() => this._container.remove()));
	}

	getStyleRules(className: string): CSSStyleRule[] {
		const existing = this._ruleCache.get(className);
		if (existing) {
			return existing;
		}
		const dummyElement = $(`span.${className}`);
		this._container.appendChild(dummyElement);
		const rules = this._getStyleRules(dummyElement, className);
		this._ruleCache.set(className, rules);
		return rules;
	}

	private _getStyleRules(element: HTMLElement, className: string) {
		const matchedRules = [];

		// Iterate through all stylesheets
		const doc = getActiveDocument();
		for (const stylesheet of doc.styleSheets) {
			try {
				// Iterate through all CSS rules in the stylesheet
				for (const rule of stylesheet.cssRules) {
					if (rule instanceof CSSImportRule) {
						// Recursively process the import rule
						if (rule.styleSheet?.cssRules) {
							for (const innerRule of rule.styleSheet.cssRules) {
								if (innerRule instanceof CSSStyleRule) {
									if (element.matches(innerRule.selectorText) && innerRule.selectorText.includes(className)) {
										matchedRules.push(innerRule);
									}
								}
							}
						}
					} else if (rule instanceof CSSStyleRule) {
						// Check if the element matches the selector
						if (element.matches(rule.selectorText) && rule.selectorText.includes(className)) {
							matchedRules.push(rule);
						}
					}
				}
			} catch (e) {
				// Some stylesheets may not be accessible due to CORS restrictions
				console.warn('Could not access stylesheet:', stylesheet.href);
			}
		}

		return matchedRules;
	}
}
