/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/terminalWidgetManager';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalProcessManager, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { Terminal, ILinkMatcherOptions } from 'xterm';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { posix, win32 } from 'vs/base/common/path';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { OperatingSystem, isMacintosh } from 'vs/base/common/platform';

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
	'((\\S*)",((\\d+)(:(\\d+))?))', // "(file path)",45 [see #78205]
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

interface IPath {
	join(...paths: string[]): string;
	normalize(path: string): string;
}

export class TerminalLinkHandler {
	private readonly _hoverDisposables = new DisposableStore();
	private _widgetManager: TerminalWidgetManager | undefined;
	private _processCwd: string | undefined;
	private _gitDiffPreImagePattern: RegExp;
	private _gitDiffPostImagePattern: RegExp;
	private readonly _tooltipCallback: (event: MouseEvent, uri: string) => boolean | void;
	private readonly _leaveCallback: () => void;

	constructor(
		private _xterm: Terminal,
		private readonly _processManager: ITerminalProcessManager | undefined,
		private readonly _configHelper: ITerminalConfigHelper,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IFileService private readonly _fileService: IFileService
	) {
		// Matches '--- a/src/file1', capturing 'src/file1' in group 1
		this._gitDiffPreImagePattern = /^--- a\/(\S*)/;
		// Matches '+++ b/src/file1', capturing 'src/file1' in group 1
		this._gitDiffPostImagePattern = /^\+\+\+ b\/(\S*)/;

		this._tooltipCallback = (e: MouseEvent) => {
			if (!this._widgetManager) {
				return;
			}
			if (this._configHelper.config.rendererType === 'dom') {
				const target = (e.target as HTMLElement);
				this._widgetManager.showMessage(target.offsetLeft, target.offsetTop, this._getLinkHoverString());
			} else {
				this._widgetManager.showMessage(e.offsetX, e.offsetY, this._getLinkHoverString());
			}
		};
		this._leaveCallback = () => {
			if (this._widgetManager) {
				this._widgetManager.closeMessage();
			}
		};

		this.registerWebLinkHandler();
		if (this._processManager) {
			this.registerLocalLinkHandler();
			this.registerGitDiffLinkHandlers();
		}
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
			tooltipCallback: this._tooltipCallback,
			leaveCallback: this._leaveCallback,
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: CUSTOM_LINK_PRIORITY
		};
		if (validationCallback) {
			options.validationCallback = (uri: string, callback: (isValid: boolean) => void) => validationCallback(uri, callback);
		}
		return this._xterm.registerLinkMatcher(regex, this._wrapLinkHandler(handler), options);
	}

	public registerWebLinkHandler(): void {
		this._terminalInstanceService.getXtermWebLinksConstructor().then((WebLinksAddon) => {
			if (!this._xterm) {
				return;
			}
			const wrappedHandler = this._wrapLinkHandler(uri => {
				this._handleHypertextLink(uri);
			});
			this._xterm.loadAddon(new WebLinksAddon(wrappedHandler, {
				validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateWebLink(uri, callback),
				tooltipCallback: this._tooltipCallback,
				leaveCallback: this._leaveCallback,
				willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e)
			}));
		});
	}

	public registerLocalLinkHandler(): void {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});
		this._xterm.registerLinkMatcher(this._localLinkRegex, wrappedHandler, {
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateLocalLink(uri, callback),
			tooltipCallback: this._tooltipCallback,
			leaveCallback: this._leaveCallback,
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: LOCAL_LINK_PRIORITY
		});
	}

	public registerGitDiffLinkHandlers(): void {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});
		const options = {
			matchIndex: 1,
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateLocalLink(uri, callback),
			tooltipCallback: this._tooltipCallback,
			leaveCallback: this._leaveCallback,
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: LOCAL_LINK_PRIORITY
		};
		this._xterm.registerLinkMatcher(this._gitDiffPreImagePattern, wrappedHandler, options);
		this._xterm.registerLinkMatcher(this._gitDiffPostImagePattern, wrappedHandler, options);
	}

	public dispose(): void {
		this._hoverDisposables.dispose();
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
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}
		const baseLocalLinkClause = this._processManager.os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
	}

	protected get _gitDiffPreImageRegex(): RegExp {
		return this._gitDiffPreImagePattern;
	}

	protected get _gitDiffPostImageRegex(): RegExp {
		return this._gitDiffPostImagePattern;
	}

	private _handleLocalLink(link: string): PromiseLike<any> {
		return this._resolvePath(link).then(resolvedLink => {
			if (!resolvedLink) {
				return Promise.resolve(null);
			}
			const lineColumnInfo: LineColumnInfo = this.extractLineColumnInfo(link);
			const selection: ITextEditorSelection = {
				startLineNumber: lineColumnInfo.lineNumber,
				startColumn: lineColumnInfo.columnNumber
			};
			return this._editorService.openEditor({ resource: resolvedLink, options: { pinned: true, selection } });
		});
	}

	private _validateLocalLink(link: string, callback: (isValid: boolean) => void): void {
		this._resolvePath(link).then(resolvedLink => callback(!!resolvedLink));
	}

	private _validateWebLink(link: string, callback: (isValid: boolean) => void): void {
		callback(true);
	}

	private _handleHypertextLink(url: string): void {
		const uri = URI.parse(url);
		this._openerService.open(uri);
	}

	private _isLinkActivationModifierDown(event: MouseEvent): boolean {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}

	private _getLinkHoverString(): string {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			if (isMacintosh) {
				return nls.localize('terminalLinkHandler.followLinkAlt.mac', "Option + click to follow link");
			} else {
				return nls.localize('terminalLinkHandler.followLinkAlt', "Alt + click to follow link");
			}
		}
		if (isMacintosh) {
			return nls.localize('terminalLinkHandler.followLinkCmd', "Cmd + click to follow link");
		}
		return nls.localize('terminalLinkHandler.followLinkCtrl', "Ctrl + click to follow link");
	}

	private get osPath(): IPath {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}
		if (this._processManager.os === OperatingSystem.Windows) {
			return win32;
		}
		return posix;
	}

	protected _preprocessPath(link: string): string | null {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}
		if (link.charAt(0) === '~') {
			// Resolve ~ -> userHome
			if (!this._processManager.userHome) {
				return null;
			}
			link = this.osPath.join(this._processManager.userHome, link.substring(1));
		} else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
			if (this._processManager.os === OperatingSystem.Windows) {
				if (!link.match('^' + winDrivePrefix)) {
					if (!this._processCwd) {
						// Abort if no workspace is open
						return null;
					}
					link = this.osPath.join(this._processCwd, link);
				}
			} else {
				if (!this._processCwd) {
					// Abort if no workspace is open
					return null;
				}
				link = this.osPath.join(this._processCwd, link);
			}
		}
		link = this.osPath.normalize(link);

		return link;
	}

	private _resolvePath(link: string): PromiseLike<URI | null> {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}

		const preprocessedLink = this._preprocessPath(link);
		if (!preprocessedLink) {
			return Promise.resolve(null);
		}

		const linkUrl = this.extractLinkUrl(preprocessedLink);
		if (!linkUrl) {
			return Promise.resolve(null);
		}

		try {
			let uri: URI;
			if (this._processManager.remoteAuthority) {
				uri = URI.from({
					scheme: REMOTE_HOST_SCHEME,
					authority: this._processManager.remoteAuthority,
					path: linkUrl
				});
			} else {
				uri = URI.file(linkUrl);
			}

			return this._fileService.resolve(uri).then(stat => {
				if (stat.isDirectory) {
					return null;
				}
				return uri;
			}).catch(() => {
				// Does not exist
				return null;
			});
		} catch {
			// Errors in parsing the path
			return Promise.resolve(null);
		}
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

		if (!matches || !this._processManager) {
			return lineColumnInfo;
		}

		const lineAndColumnMatchIndex = this._processManager.os === OperatingSystem.Windows ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;
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
