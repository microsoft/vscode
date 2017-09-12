/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as pfs from 'vs/base/node/pfs';
import Uri from 'vs/base/common/uri';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TerminalWidgetManager } from 'vs/workbench/parts/terminal/browser/terminalWidgetManager';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/** As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
replacing space with nonBreakningSpace or space ASCII code - 32. */
const lineAndColumnClause = [
	'((\\S*) on line ((\\d+)(, column (\\d+))?))', // (file path) on line 8, column 13
	'((\\S*):line ((\\d+)(, column (\\d+))?))', // (file path):line 8, column 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (file path):336, (file path):336:9
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
const winLineAndColumnMatchIndex = 12;
const unixLineAndColumnMatchIndex = 23;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
const lineAndColumnClauseGroupCount = 6;

/** Higher than local link, lower than hypertext */
const CUSTOM_LINK_PRIORITY = -1;
/** Lowest */
const LOCAL_LINK_PRIORITY = -2;

export type XtermLinkMatcherHandler = (event: MouseEvent, uri: string) => boolean | void;
export type XtermLinkMatcherValidationCallback = (uri: string, element: HTMLElement, callback: (isValid: boolean) => void) => void;

export class TerminalLinkHandler {
	private _hoverDisposables: IDisposable[] = [];
	private _mouseMoveDisposable: IDisposable;
	private _widgetManager: TerminalWidgetManager;

	private _localLinkPattern: RegExp;

	constructor(
		private _xterm: any,
		private _platform: platform.Platform,
		private _initialCwd: string,
		@IOpenerService private _openerService: IOpenerService,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		const baseLocalLinkClause = _platform === platform.Platform.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		this._localLinkPattern = new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);

		this._xterm.setHypertextLinkHandler(this._wrapLinkHandler(uri => {
			this._handleHypertextLink(uri);
		}));

		this._xterm.setHypertextValidationCallback((uri: string, element: HTMLElement, callback: (isValid: boolean) => void) => {
			this._validateWebLink(uri, element, callback);
		});
	}

	public setWidgetManager(widgetManager: TerminalWidgetManager): void {
		this._widgetManager = widgetManager;
	}

	public registerCustomLinkHandler(regex: RegExp, handler: (uri: string) => void, matchIndex?: number, validationCallback?: XtermLinkMatcherValidationCallback): number {
		const wrappedValidationCallback = (uri, element, callback) => {
			this._addTooltipEventListeners(element);
			if (validationCallback) {
				validationCallback(uri, element, callback);
			} else {
				callback(true);
			}
		};
		return this._xterm.registerLinkMatcher(regex, this._wrapLinkHandler(handler), {
			matchIndex,
			validationCallback: wrappedValidationCallback,
			priority: CUSTOM_LINK_PRIORITY
		});
	}

	public registerLocalLinkHandler(): number {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});

		return this._xterm.registerLinkMatcher(this._localLinkRegex, wrappedHandler, {
			validationCallback: (link: string, element: HTMLElement, callback: (isValid: boolean) => void) => this._validateLocalLink(link, element, callback),
			priority: LOCAL_LINK_PRIORITY
		});
	}

	public dispose(): void {
		this._hoverDisposables = dispose(this._hoverDisposables);
		this._mouseMoveDisposable = dispose(this._mouseMoveDisposable);
	}

	private _wrapLinkHandler(handler: (uri: string) => boolean | void): XtermLinkMatcherHandler {
		return (event: MouseEvent, uri: string) => {
			// Prevent default electron link handling so Alt+Click mode works normally
			event.preventDefault();
			// Require correct modifier on click
			if (!this._isLinkActivationModifierDown(event)) {
				return false;
			}
			return handler(uri);
		};
	}

	protected get _localLinkRegex(): RegExp {
		return this._localLinkPattern;
	}

	private _handleLocalLink(link: string): TPromise<void> {
		return this._resolvePath(link).then(resolvedLink => {
			if (!resolvedLink) {
				return void 0;
			}

			let normalizedPath = path.normalize(path.resolve(resolvedLink));
			const normalizedUrl = this.extractLinkUrl(normalizedPath);

			normalizedPath = this._formatLocalLinkPath(normalizedPath);

			let resource = Uri.file(normalizedUrl);
			resource = resource.with({
				fragment: Uri.parse(normalizedPath).fragment
			});

			return this._openerService.open(resource);
		});
	}

	private _validateLocalLink(link: string, element: HTMLElement, callback: (isValid: boolean) => void): void {
		this._resolvePath(link).then(resolvedLink => {
			if (resolvedLink) {
				this._addTooltipEventListeners(element);
			}
			callback(!!resolvedLink);
		});
	}

	private _validateWebLink(link: string, element: HTMLElement, callback: (isValid: boolean) => void): void {
		this._addTooltipEventListeners(element);
		callback(true);
	}

	private _handleHypertextLink(url: string): void {
		let uri = Uri.parse(url);
		this._openerService.open(uri);
	}

	private _isLinkActivationModifierDown(event: MouseEvent): boolean {
		const editorConf = this._configurationService.getConfiguration<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return platform.isMacintosh ? event.metaKey : event.ctrlKey;
	}

	private _getLinkHoverString(): string {
		const editorConf = this._configurationService.getConfiguration<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return nls.localize('terminalLinkHandler.followLinkAlt', 'Alt + click to follow link');
		}
		if (platform.isMacintosh) {
			return nls.localize('terminalLinkHandler.followLinkCmd', 'Cmd + click to follow link');
		}
		return nls.localize('terminalLinkHandler.followLinkCtrl', 'Ctrl + click to follow link');
	}

	private _addTooltipEventListeners(element: HTMLElement): void {
		let timeout = null;
		let isMessageShowing = false;
		this._hoverDisposables.push(dom.addDisposableListener(element, dom.EventType.MOUSE_OVER, e => {
			element.classList.toggle('active', this._isLinkActivationModifierDown(e));
			this._mouseMoveDisposable = dom.addDisposableListener(element, dom.EventType.MOUSE_MOVE, e => {
				element.classList.toggle('active', this._isLinkActivationModifierDown(e));
			});
			timeout = setTimeout(() => {
				this._widgetManager.showMessage(element.offsetLeft, element.offsetTop, this._getLinkHoverString());
				isMessageShowing = true;
			}, 500);
		}));
		this._hoverDisposables.push(dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => {
			element.classList.remove('active');
			if (this._mouseMoveDisposable) {
				this._mouseMoveDisposable.dispose();
			}
			clearTimeout(timeout);
			this._widgetManager.closeMessage();
			isMessageShowing = false;
		}));
	}

	protected _preprocessPath(link: string): string {
		if (this._platform === platform.Platform.Windows) {
			// Resolve ~ -> %HOMEDRIVE%\%HOMEPATH%
			if (link.charAt(0) === '~') {
				if (!process.env.HOMEDRIVE || !process.env.HOMEPATH) {
					return null;
				}
				link = `${process.env.HOMEDRIVE}\\${process.env.HOMEPATH + link.substring(1)}`;
			}

			// Resolve relative paths (.\a, ..\a, ~\a, a\b)
			if (!link.match('^' + winDrivePrefix)) {
				if (!this._initialCwd) {
					// Abort if no workspace is open
					return null;
				}
				link = path.join(this._initialCwd, link);
			}
		}
		// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
		else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			if (!this._initialCwd) {
				// Abort if no workspace is open
				return null;
			}
			link = path.join(this._initialCwd, link);
		}
		return link;
	}

	private _resolvePath(link: string): TPromise<string> {
		link = this._preprocessPath(link);
		if (!link) {
			return TPromise.as(void 0);
		}

		const linkUrl = this.extractLinkUrl(link);
		if (!linkUrl) {
			return TPromise.as(void 0);
		}

		// Open an editor if the path exists
		return pfs.fileExists(linkUrl).then(isFile => {
			if (!isFile) {
				return null;
			}
			return link;
		});
	}

	/**
	 * Appends line number and column number to link if they exists.
	 * @param link link to format, will become link#line_num,col_num.
	 */
	private _formatLocalLinkPath(link: string): string {
		const lineColumnInfo: LineColumnInfo = this.extractLineColumnInfo(link);
		if (lineColumnInfo.lineNumber) {
			link += `#${lineColumnInfo.lineNumber}`;

			if (lineColumnInfo.columnNumber) {
				link += `,${lineColumnInfo.columnNumber}`;
			}
		}

		return link;
	}

	/**
	 * Returns line and column number of URl if that is present.
	 *
	 * @param link Url link which may contain line and column number.
	 */
	public extractLineColumnInfo(link: string): LineColumnInfo {
		const matches: string[] = this._localLinkRegex.exec(link);
		const lineColumnInfo: LineColumnInfo = {};
		const lineAndColumnMatchIndex = this._platform === platform.Platform.Windows ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;

		for (let i = 0; i < lineAndColumnClause.length; i++) {
			const lineMatchIndex = lineAndColumnMatchIndex + (lineAndColumnClauseGroupCount * i);
			const rowNumber = matches[lineMatchIndex];
			if (rowNumber) {
				lineColumnInfo['lineNumber'] = rowNumber;
				// Check if column number exists
				const columnNumber = matches[lineMatchIndex + 2];
				if (columnNumber) {
					lineColumnInfo['columnNumber'] = columnNumber;
				}
				break;
			}
		}

		return lineColumnInfo;
	}

	/**
	 * Returns url from link as link may contain line and column information.
	 *
	 * @param link url link which may contain line and column number.
	 */
	public extractLinkUrl(link: string): string {
		const matches: string[] = this._localLinkRegex.exec(link);
		if (!matches) {
			return null;
		}
		return matches[1];
	}
}

export interface LineColumnInfo {
	lineNumber?: string;
	columnNumber?: string;
};
