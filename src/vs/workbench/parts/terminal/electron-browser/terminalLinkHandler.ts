/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as pfs from 'vs/base/node/pfs';
import { URI as Uri } from 'vs/base/common/uri';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TerminalWidgetManager } from 'vs/workbench/parts/terminal/browser/terminalWidgetManager';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILinkMatcherOptions } from 'vscode-xterm';

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
	'((\\S*)", line ((\\d+)( column (\\d+))?))', // "(file path)", line 45 [see #40468]
	'((\\S*) on line ((\\d+)(, column (\\d+))?))', // (file path) on line 8, column 13
	'((\\S*):line ((\\d+)(, column (\\d+))?))', // (file path):line 8, column 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (file path):336, (file path):336:9
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
const winLineAndColumnMatchIndex = 12;
const unixLineAndColumnMatchIndex = 11;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
const lineAndColumnClauseGroupCount = 6;

/** Higher than local link, lower than hypertext */
const CUSTOM_LINK_PRIORITY = -1;
/** Lowest */
const LOCAL_LINK_PRIORITY = -2;

export type XtermLinkMatcherHandler = (event: MouseEvent, uri: string) => boolean | void;
export type XtermLinkMatcherValidationCallback = (uri: string, callback: (isValid: boolean) => void) => void;

export class TerminalLinkHandler {
	private _hoverDisposables: IDisposable[] = [];
	private _mouseMoveDisposable: IDisposable;
	private _widgetManager: TerminalWidgetManager;
	private _processCwd: string;
	private _localLinkPattern: RegExp;

	constructor(
		private _xterm: any,
		private _platform: platform.Platform,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		const baseLocalLinkClause = _platform === platform.Platform.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		this._localLinkPattern = new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
		this.registerWebLinkHandler();
		this.registerLocalLinkHandler();
	}

	public setWidgetManager(widgetManager: TerminalWidgetManager): void {
		this._widgetManager = widgetManager;
	}

	public set processCwd(processCwd: string) {
		this._processCwd = processCwd;
	}

	public registerCustomLinkHandler(regex: RegExp, handler: (uri: string) => void, matchIndex?: number, validationCallback?: XtermLinkMatcherValidationCallback): number {
		const options: ILinkMatcherOptions = {
			matchIndex,
			tooltipCallback: (e: MouseEvent) => {
				if (this._terminalService && this._terminalService.configHelper.config.rendererType === 'dom') {
					const target = (e.target as HTMLElement);
					this._widgetManager.showMessage(target.offsetLeft, target.offsetTop, this._getLinkHoverString());
				} else {
					this._widgetManager.showMessage(e.offsetX, e.offsetY, this._getLinkHoverString());
				}
			},
			leaveCallback: () => this._widgetManager.closeMessage(),
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: CUSTOM_LINK_PRIORITY
		};
		if (validationCallback) {
			options.validationCallback = (uri: string, callback: (isValid: boolean) => void) => validationCallback(uri, callback);
		}
		return this._xterm.registerLinkMatcher(regex, this._wrapLinkHandler(handler), options);
	}

	public registerWebLinkHandler(): void {
		const wrappedHandler = this._wrapLinkHandler(uri => {
			this._handleHypertextLink(uri);
		});
		this._xterm.webLinksInit(wrappedHandler, {
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateWebLink(uri, callback),
			tooltipCallback: (e: MouseEvent) => {
				if (this._terminalService && this._terminalService.configHelper.config.rendererType === 'dom') {
					const target = (e.target as HTMLElement);
					this._widgetManager.showMessage(target.offsetLeft, target.offsetTop, this._getLinkHoverString());
				} else {
					this._widgetManager.showMessage(e.offsetX, e.offsetY, this._getLinkHoverString());
				}
			},
			leaveCallback: () => this._widgetManager.closeMessage(),
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e)
		});
	}

	public registerLocalLinkHandler(): void {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});
		this._xterm.registerLinkMatcher(this._localLinkRegex, wrappedHandler, {
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateLocalLink(uri, callback),
			tooltipCallback: (e: MouseEvent) => {
				if (this._terminalService && this._terminalService.configHelper.config.rendererType === 'dom') {
					const target = (e.target as HTMLElement);
					this._widgetManager.showMessage(target.offsetLeft, target.offsetTop, this._getLinkHoverString());
				} else {
					this._widgetManager.showMessage(e.offsetX, e.offsetY, this._getLinkHoverString());
				}
			},
			leaveCallback: () => this._widgetManager.closeMessage(),
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: LOCAL_LINK_PRIORITY
		});
	}

	public dispose(): void {
		this._xterm = null;
		this._hoverDisposables = dispose(this._hoverDisposables);
		this._mouseMoveDisposable = dispose(this._mouseMoveDisposable);
	}

	private _wrapLinkHandler(handler: (uri: string) => boolean | void): XtermLinkMatcherHandler {
		return (event: MouseEvent, uri: string) => {
			// Prevent default electron link handling so Alt+Click mode works normally
			event.preventDefault();
			// Require correct modifier on click
			if (!this._isLinkActivationModifierDown(event)) {
				// If the modifier is not pressed, the terminal should be
				// focused if it's not already
				this._terminalService.getActiveInstance()!.focus(true);
				return false;
			}
			return handler(uri);
		};
	}

	protected get _localLinkRegex(): RegExp {
		return this._localLinkPattern;
	}

	private _handleLocalLink(link: string): PromiseLike<any> {
		return this._resolvePath(link).then(resolvedLink => {
			if (!resolvedLink) {
				return Promise.resolve(null);
			}
			const normalizedPath = path.normalize(path.resolve(resolvedLink));
			const normalizedUrl = this.extractLinkUrl(normalizedPath);
			if (!normalizedUrl) {
				return Promise.resolve(null);
			}
			const resource = Uri.file(normalizedUrl);
			const lineColumnInfo: LineColumnInfo = this.extractLineColumnInfo(link);
			const selection: ITextEditorSelection = {
				startLineNumber: lineColumnInfo.lineNumber,
				startColumn: lineColumnInfo.columnNumber
			};

			return this._editorService.openEditor({ resource, options: { pinned: true, selection } });
		});
	}

	private _validateLocalLink(link: string, callback: (isValid: boolean) => void): void {
		this._resolvePath(link).then(resolvedLink => callback(!!resolvedLink));
	}

	private _validateWebLink(link: string, callback: (isValid: boolean) => void): void {
		callback(true);
	}

	private _handleHypertextLink(url: string): void {
		const uri = Uri.parse(url);
		this._openerService.open(uri);
	}

	private _isLinkActivationModifierDown(event: MouseEvent): boolean {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return platform.isMacintosh ? event.metaKey : event.ctrlKey;
	}

	private _getLinkHoverString(): string {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return nls.localize('terminalLinkHandler.followLinkAlt', 'Alt + click to follow link');
		}
		if (platform.isMacintosh) {
			return nls.localize('terminalLinkHandler.followLinkCmd', 'Cmd + click to follow link');
		}
		return nls.localize('terminalLinkHandler.followLinkCtrl', 'Ctrl + click to follow link');
	}

	protected _preprocessPath(link: string): string | null {
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
				if (!this._processCwd) {
					// Abort if no workspace is open
					return null;
				}
				link = path.join(this._processCwd, link);
			}
		}
		// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
		else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			if (!this._processCwd) {
				// Abort if no workspace is open
				return null;
			}
			link = path.join(this._processCwd, link);
		}
		return link;
	}

	private _resolvePath(link: string): PromiseLike<string | null> {
		const preprocessedLink = this._preprocessPath(link);
		if (!preprocessedLink) {
			return Promise.resolve(null);
		}

		const linkUrl = this.extractLinkUrl(preprocessedLink);
		if (!linkUrl) {
			return Promise.resolve(null);
		}

		// Ensure the file exists on disk, so an editor can be opened after clicking it
		return pfs.fileExists(linkUrl).then(isFile => {
			if (!isFile) {
				return null;
			}
			return preprocessedLink;
		});
	}

	/**
	 * Returns line and column number of URl if that is present.
	 *
	 * @param link Url link which may contain line and column number.
	 */
	public extractLineColumnInfo(link: string): LineColumnInfo {
		const matches: string[] | null = this._localLinkRegex.exec(link);
		const lineColumnInfo: LineColumnInfo = {
			lineNumber: 1,
			columnNumber: 1
		};

		if (!matches) {
			return lineColumnInfo;
		}

		const lineAndColumnMatchIndex = this._platform === platform.Platform.Windows ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;
		for (let i = 0; i < lineAndColumnClause.length; i++) {
			const lineMatchIndex = lineAndColumnMatchIndex + (lineAndColumnClauseGroupCount * i);
			const rowNumber = matches[lineMatchIndex];
			if (rowNumber) {
				lineColumnInfo['lineNumber'] = parseInt(rowNumber, 10);
				// Check if column number exists
				const columnNumber = matches[lineMatchIndex + 2];
				if (columnNumber) {
					lineColumnInfo['columnNumber'] = parseInt(columnNumber, 10);
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
	public extractLinkUrl(link: string): string | null {
		const matches: string[] | null = this._localLinkRegex.exec(link);
		if (!matches) {
			return null;
		}
		return matches[1];
	}
}

export interface LineColumnInfo {
	lineNumber: number;
	columnNumber: number;
}
