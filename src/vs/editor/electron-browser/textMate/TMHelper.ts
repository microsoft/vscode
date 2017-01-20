/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IColorTheme, IThemeSettingStyle } from 'vs/workbench/services/themes/common/themeService';

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
	for (let i = theme.settings.length - 1; i >= 0; i--) {
		let rule = theme.settings[i];
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
	readonly settings: IThemeSettingStyle;
	readonly scope: string;
	readonly parentScopes: string[];

	constructor(rawSelector: string, settings: IThemeSettingStyle) {
		this.rawSelector = rawSelector;
		this.settings = settings;
		let rawSelectorPieces = this.rawSelector.split(/ /);
		this.scope = rawSelectorPieces[rawSelectorPieces.length - 1];
		this.parentScopes = rawSelectorPieces.slice(0, rawSelectorPieces.length - 1);
	}

	public matches(scope: string, parentScopes: string[]): boolean {
		return ThemeRule._matches(this.scope, this.parentScopes, scope, parentScopes);
	}

	public isMoreSpecific(other: ThemeRule): boolean {
		if (other === null) {
			return true;
		}
		if (other.scope.length === this.scope.length) {
			return this.parentScopes.length > other.parentScopes.length;
		}
		return (this.scope.length > other.scope.length);
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
