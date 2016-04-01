/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Themes = require('vs/platform/theme/common/themes');
import {
	supportedColorSelectors,
	supportedIconSelectors,
	supportedCssProperties
} from 'vs/workbench/services/themes/common/cssThemeService';
import {parseCssString} from 'vs/base/node/cssParse';
import assert = require('assert');


const SELECTOR_NOT_SUPPORTED = 'Theme selector not supported';
const THEME_CSS_PROPERTY_NOT_SUPPORTED = 'Theme css property not supported';

export class CssThemeService {

	parseSource(themeDirectory: string, themeId: string, themeComponent: string, cssSource: string) {
		assert.ok(!!themeDirectory, 'Invalid theme directory');
		assert.ok(!!themeId, 'Invalid themeId');
		assert.ok(!!themeComponent, 'Invalid themeComponent');

		let syntaxTree = parseCssString(cssSource, themeDirectory);
		assert.ok(
			!!syntaxTree && syntaxTree.obj.stylesheet.parsingErrors.length === 0,
			syntaxTree.obj.stylesheet.parsingErrors
		);
		if (syntaxTree.obj.stylesheet.rules.length === 0) {
			return '';
		}

		// generate the theme class name
		let themeSelector = `${Themes.getBaseThemeId(themeId)}.${Themes.getSyntaxThemeId(themeId)}`;

		// determine the supported selectors from themeComponent
		let supportedSelectors = supportedColorSelectors;
		if (themeComponent === Themes.ComponentType.ICON) {
			// don't include base theme with icons otherwise it would switch base theme in editor
			themeSelector = Themes.stripBaseTheme(themeSelector, '.');
			supportedSelectors = supportedIconSelectors;
		}

		// ensure rules and properties are supported
		let parsedStatements = this._parseCssRules(
			syntaxTree.obj.stylesheet.rules,
			supportedSelectors
		);

		// replace theme css rules for editor rules
		parsedStatements.forEach((statement, index) => {
			let formattedStatement = statement
				.replace('.editor', `.monaco-editor.${themeSelector} `)
				.replace('.workbench', `.${themeSelector} .monaco-workbench `)
				.replace('.expanded.folder-icon', `.monaco-tree-row.expanded .folder-icon`)
				.replace('.explorer-viewlet', `.${themeSelector} .monaco-workbench .explorer-viewlet `);
			parsedStatements[index] = formattedStatement;
		});

		return parsedStatements.join('\n');
	}

	_parseCssRules(rules, supportedSelectors: Array<string>) {
		const statements = [];
		rules.forEach(rule => {
			if (rule.type === 'comment') {
				return;
			}
			rule.selectors.forEach(selector => {
				if (this._supportsSelector(selector, supportedSelectors) === false) {
					throw new Error(`${SELECTOR_NOT_SUPPORTED}. '${selector}'`);
				}
				const cssProperties = this._parseCssProperties(rule);
				const cssRule = `${selector.replace(/ /g, '')} {${cssProperties}}`; // until we have scope hierarchy in the editor dom: replace spaces with .
				statements.push(cssRule);
			});
		});
		return statements;
	}

	_parseCssProperties(rule) {
		const properties = [];
		rule.declarations.forEach(declaration => {
			const property = declaration.property;
			const value = declaration.value;
			if (supportedCssProperties[property] !== true) {
				throw new Error(`${THEME_CSS_PROPERTY_NOT_SUPPORTED}. '${property}: ${value};'`);
			}
			properties.push(`${property}: ${value};`);
		});
		return properties.join(' ');
	}

	_supportsSelector(testSelector: string, supportedSelectors: Array<string>) {
		let notSupported = supportedSelectors.every(supported => {
			return testSelector.indexOf(supported) === -1;
		});
		return notSupported === false;
	}

}