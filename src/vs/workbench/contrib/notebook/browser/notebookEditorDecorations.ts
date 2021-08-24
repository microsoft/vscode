/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { IContentDecorationRenderOptions, isThemeColor } from 'vs/editor/common/editorCommon';
import { IColorTheme, IThemeService, ThemeColor } from 'vs/platform/theme/common/themeService';
import { INotebookDecorationRenderOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { _CSS_MAP } from 'vs/editor/browser/services/codeEditorServiceImpl';

export class NotebookRefCountedStyleSheet {
	private readonly _key: string;
	private readonly _styleSheet: HTMLStyleElement;
	private _refCount: number;

	constructor(readonly widget: { removeEditorStyleSheets: (key: string) => void; }, key: string, styleSheet: HTMLStyleElement) {
		this._key = key;
		this._styleSheet = styleSheet;
		this._refCount = 0;
	}

	public ref(): void {
		this._refCount++;
	}

	public unref(): void {
		this._refCount--;
		if (this._refCount === 0) {
			this._styleSheet.parentNode?.removeChild(this._styleSheet);
			this.widget.removeEditorStyleSheets(this._key);
		}
	}

	public insertRule(rule: string, index?: number): void {
		const sheet = <CSSStyleSheet>this._styleSheet.sheet;
		sheet.insertRule(rule, index);
	}
}

interface ProviderArguments {
	styleSheet: NotebookRefCountedStyleSheet;
	key: string;
	options: INotebookDecorationRenderOptions;
}

export class NotebookDecorationCSSRules {
	private _theme: IColorTheme;
	private _className: string;
	private _topClassName: string;

	get className() {
		return this._className;
	}

	get topClassName() {
		return this._topClassName;
	}

	constructor(
		private readonly _themeService: IThemeService,
		private readonly _styleSheet: NotebookRefCountedStyleSheet,
		private readonly _providerArgs: ProviderArguments
	) {
		this._styleSheet.ref();
		this._theme = this._themeService.getColorTheme();
		this._className = CSSNameHelper.getClassName(this._providerArgs.key, CellDecorationCSSRuleType.ClassName);
		this._topClassName = CSSNameHelper.getClassName(this._providerArgs.key, CellDecorationCSSRuleType.TopClassName);
		this._buildCSS();
	}

	private _buildCSS() {
		if (this._providerArgs.options.backgroundColor) {
			const backgroundColor = this._resolveValue(this._providerArgs.options.backgroundColor);
			this._styleSheet.insertRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.${this.className} .cell-focus-indicator,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.${this.className} {
				background-color: ${backgroundColor} !important;
			}`);
		}

		if (this._providerArgs.options.borderColor) {
			const borderColor = this._resolveValue(this._providerArgs.options.borderColor);

			this._styleSheet.insertRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-focus-indicator-top:before,
					.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-focus-indicator-bottom:before {
						border-color: ${borderColor} !important;
					}`);

			this._styleSheet.insertRule(`
					.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-focus-indicator-bottom:before {
						content: "";
						position: absolute;
						width: 100%;
						height: 1px;
						border-bottom: 1px solid ${borderColor};
						bottom: 0px;
					`);

			this._styleSheet.insertRule(`
					.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-focus-indicator-top:before {
						content: "";
						position: absolute;
						width: 100%;
						height: 1px;
						border-top: 1px solid ${borderColor};
					`);

			// more specific rule for `.focused` can override existing rules
			this._styleSheet.insertRule(`.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused.${this.className} .cell-focus-indicator-top:before,
				.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused.${this.className} .cell-focus-indicator-bottom:before {
					border-color: ${borderColor} !important;
				}`);
		}

		if (this._providerArgs.options.top) {
			const unthemedCSS = this._getCSSTextForModelDecorationContentClassName(this._providerArgs.options.top);
			this._styleSheet.insertRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-decoration .${this.topClassName} {
				height: 1rem;
				display: block;
			}`);

			this._styleSheet.insertRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.${this.className} .cell-decoration .${this.topClassName}::before {
				display: block;
				${unthemedCSS}
			}`);
		}
	}

	/**
 * Build the CSS for decorations styled before or after content.
 */
	private _getCSSTextForModelDecorationContentClassName(opts: IContentDecorationRenderOptions | undefined): string {
		if (!opts) {
			return '';
		}
		const cssTextArr: string[] = [];

		if (typeof opts !== 'undefined') {
			this._collectBorderSettingsCSSText(opts, cssTextArr);
			if (typeof opts.contentIconPath !== 'undefined') {
				cssTextArr.push(strings.format(_CSS_MAP.contentIconPath, DOM.asCSSUrl(URI.revive(opts.contentIconPath))));
			}
			if (typeof opts.contentText === 'string') {
				const truncated = opts.contentText.match(/^.*$/m)![0]; // only take first line
				const escaped = truncated.replace(/['\\]/g, '\\$&');

				cssTextArr.push(strings.format(_CSS_MAP.contentText, escaped));
			}
			this._collectCSSText(opts, ['fontStyle', 'fontWeight', 'textDecoration', 'color', 'opacity', 'backgroundColor', 'margin'], cssTextArr);
			if (this._collectCSSText(opts, ['width', 'height'], cssTextArr)) {
				cssTextArr.push('display:inline-block;');
			}
		}

		return cssTextArr.join('');
	}

	private _collectBorderSettingsCSSText(opts: any, cssTextArr: string[]): boolean {
		if (this._collectCSSText(opts, ['border', 'borderColor', 'borderRadius', 'borderSpacing', 'borderStyle', 'borderWidth'], cssTextArr)) {
			cssTextArr.push(strings.format('box-sizing: border-box;'));
			return true;
		}
		return false;
	}

	private _collectCSSText(opts: any, properties: string[], cssTextArr: string[]): boolean {
		const lenBefore = cssTextArr.length;
		for (let property of properties) {
			const value = this._resolveValue(opts[property]);
			if (typeof value === 'string') {
				cssTextArr.push(strings.format(_CSS_MAP[property], value));
			}
		}
		return cssTextArr.length !== lenBefore;
	}

	private _resolveValue(value: string | ThemeColor): string {
		if (isThemeColor(value)) {
			const color = this._theme.getColor(value.id);
			if (color) {
				return color.toString();
			}
			return 'transparent';
		}
		return value;
	}

	dispose() {
		this._styleSheet.unref();
	}
}

const enum CellDecorationCSSRuleType {
	ClassName = 0,
	TopClassName = 0,
}

class CSSNameHelper {

	public static getClassName(key: string, type: CellDecorationCSSRuleType): string {
		return 'nb-' + key + '-' + type;
	}
}
