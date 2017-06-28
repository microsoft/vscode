/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IColorTheme, ITokenColorizationSetting } from 'vs/workbench/services/themes/common/workbenchThemeService';

export function findMatchingThemeRule(theme: IColorTheme, scopes: string[]): ThemeRule {
	for (let i = scopes.length - 1; i >= 0; i--) {
		let parentScopes = scopes.slice(0, i);
		let scope = scopes[i];
		let r = findMatchingThemeRule2(theme, scope, parentScopes);
		if (r) {
			return r;
		}
	}
	return null;
}

function findMatchingThemeRule2(theme: IColorTheme, scope: string, parentScopes: string[]): ThemeRule {
	let result: ThemeRule = null;

	// Loop backwards, to ensure the last most specific rule wins
	for (let i = theme.tokenColors.length - 1; i >= 0; i--) {
		let rule = theme.tokenColors[i];
		if (!rule.settings.foreground) {
			continue;
		}

		let selectors: string[];
		if (typeof rule.scope === 'string') {
			selectors = rule.scope.split(/,/).map(scope => scope.trim());
		} else if (Array.isArray(rule.scope)) {
			selectors = rule.scope;
		} else {
			continue;
		}

		for (let j = 0, lenJ = selectors.length; j < lenJ; j++) {
			let rawSelector = selectors[j];

			let themeRule = new ThemeRule(rawSelector, rule.settings);
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
	readonly rawSelector: string;
	readonly settings: ITokenColorizationSetting;
	readonly scope: string;
	readonly parentScopes: string[];

	constructor(rawSelector: string, settings: ITokenColorizationSetting) {
		this.rawSelector = rawSelector;
		this.settings = settings;
		let rawSelectorPieces = this.rawSelector.split(/ /);
		this.scope = rawSelectorPieces[rawSelectorPieces.length - 1];
		this.parentScopes = rawSelectorPieces.slice(0, rawSelectorPieces.length - 1);
	}

	public matches(scope: string, parentScopes: string[]): boolean {
		return ThemeRule._matches(this.scope, this.parentScopes, scope, parentScopes);
	}

	private static _cmp(a: ThemeRule, b: ThemeRule): number {
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
			var aLen = a.parentScopes[i].length;
			var bLen = b.parentScopes[i].length;
			if (aLen !== bLen) {
				return aLen - bLen;
			}
		}
		return 0;
	}

	public isMoreSpecific(other: ThemeRule): boolean {
		return (ThemeRule._cmp(this, other) > 0);
	}

	private static _matchesOne(selectorScope: string, scope: string): boolean {
		let selectorPrefix = selectorScope + '.';
		if (selectorScope === scope || scope.substring(0, selectorPrefix.length) === selectorPrefix) {
			return true;
		}
		return false;
	}

	private static _matches(selectorScope: string, selectorParentScopes: string[], scope: string, parentScopes: string[]): boolean {
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
