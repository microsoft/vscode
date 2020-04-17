/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { DisposableStore, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalProcessManager, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService } from 'vs/platform/files/common/files';
import { Terminal, ILinkMatcherOptions, IViewportRange, ITerminalAddon } from 'xterm';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { posix, win32 } from 'vs/base/common/path';
import { ITerminalInstanceService, ITerminalBeforeHandleLinkEvent, LINK_INTERCEPT_THRESHOLD } from 'vs/workbench/contrib/terminal/browser/terminal';
import { OperatingSystem, isMacintosh, OS } from 'vs/base/common/platform';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { TerminalWebLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWebLinkProvider';
import { TerminalValidatedLocalLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalValidatedLocalLinkProvider';
import { TerminalWordLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWordLinkProvider';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { isEqualOrParent } from 'vs/base/common/resources';
import { ISearchService } from 'vs/workbench/services/search/common/search';
import { QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { XTermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { TerminalHover } from 'vs/workbench/contrib/terminal/browser/widgets/terminalHoverWidget';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
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

export type XtermLinkMatcherHandler = (event: MouseEvent, link: string) => Promise<void>;
export type XtermLinkMatcherValidationCallback = (uri: string, callback: (isValid: boolean) => void) => void;

interface IPath {
	join(...paths: string[]): string;
	normalize(path: string): string;
}

/**
 * An object responsible for managing registration of link matchers and link providers.
 */
export class TerminalLinkManager extends DisposableStore {
	private _widgetManager: TerminalWidgetManager | undefined;
	private _processCwd: string | undefined;
	private _gitDiffPreImagePattern: RegExp;
	private _gitDiffPostImagePattern: RegExp;
	private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, linkHandler: (url: string) => void) => boolean | void;
	private _linkMatchers: number[] = [];
	private _webLinksAddon: ITerminalAddon | undefined;
	private _linkProviders: IDisposable[] = [];
	private _hasBeforeHandleLinkListeners = false;
	private readonly _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	protected static _LINK_INTERCEPT_THRESHOLD = LINK_INTERCEPT_THRESHOLD;
	public static readonly LINK_INTERCEPT_THRESHOLD = TerminalLinkManager._LINK_INTERCEPT_THRESHOLD;

	private readonly _onBeforeHandleLink = this.add(new Emitter<ITerminalBeforeHandleLinkEvent>({
		onFirstListenerAdd: () => this._hasBeforeHandleLinkListeners = true,
		onLastListenerRemove: () => this._hasBeforeHandleLinkListeners = false
	}));
	/**
	 * Allows intercepting links and handling them outside of the default link handler. When fired
	 * the listener has a set amount of time to handle the link or the default handler will fire.
	 * This was designed to only be handled by a single listener.
	 */
	public get onBeforeHandleLink(): Event<ITerminalBeforeHandleLinkEvent> { return this._onBeforeHandleLink.event; }

	constructor(
		private _xterm: Terminal,
		private readonly _processManager: ITerminalProcessManager,
		private readonly _configHelper: ITerminalConfigHelper,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IHostService private readonly _hostService: IHostService,
		@ISearchService private readonly _searchService: ISearchService
	) {
		super();

		// Matches '--- a/src/file1', capturing 'src/file1' in group 1
		this._gitDiffPreImagePattern = /^--- a\/(\S*)/;
		// Matches '+++ b/src/file1', capturing 'src/file1' in group 1
		this._gitDiffPostImagePattern = /^\+\+\+ b\/(\S*)/;

		this._tooltipCallback = (e: MouseEvent, uri: string, linkRange: IViewportRange, linkHandler: (url: string) => void) => {
			if (!this._widgetManager) {
				return;
			}

			const core = (this._xterm as any)._core as XTermCore;
			const cellDimensions = {
				width: core._renderService.dimensions.actualCellWidth,
				height: core._renderService.dimensions.actualCellHeight
			};
			const terminalDimensions = {
				width: this._xterm.cols,
				height: this._xterm.rows
			};

			this._showHover(
				linkRange,
				cellDimensions,
				terminalDimensions,
				this._getLinkHoverString(uri),
				linkHandler
			);
		};

		if (this._configHelper.config.experimentalLinkProvider) {
			this.registerLinkProvider();
		} else {
			this._registerLinkMatchers();
		}

		this._configurationService?.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.experimentalLinkProvider')) {
				if (this._configHelper.config.experimentalLinkProvider) {
					this._deregisterLinkMatchers();
					this.registerLinkProvider();
				} else {
					dispose(this._linkProviders);
					this._linkProviders.length = 0;
					this._registerLinkMatchers();
				}
			}
		});
	}

	private _showHover(
		viewportRange: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number },
		text: IMarkdownString,
		linkHandler: (url: string) => void
	) {
		if (this._widgetManager) {
			const widget = this._instantiationService.createInstance(TerminalHover, viewportRange, cellDimensions, terminalDimensions, text, linkHandler);
			this._widgetManager.attachWidget(widget);
		}
	}

	private _registerLinkMatchers() {
		this.registerWebLinkHandler();
		if (this._processManager) {
			if (this._configHelper.config.enableFileLinks) {
				this.registerLocalLinkHandler();
			}
			this.registerGitDiffLinkHandlers();
		}
	}

	private _deregisterLinkMatchers() {
		this._webLinksAddon?.dispose();

		this._linkMatchers.forEach(matcherId => {
			this._xterm.deregisterLinkMatcher(matcherId);
		});
	}

	public setWidgetManager(widgetManager: TerminalWidgetManager): void {
		this._widgetManager = widgetManager;
	}

	public set processCwd(processCwd: string) {
		this._processCwd = processCwd;
	}

	public registerCustomLinkHandler(regex: RegExp, handler: (uri: string) => void, matchIndex?: number, validationCallback?: XtermLinkMatcherValidationCallback): number {
		const tooltipCallback = (event: MouseEvent, uri: string, location: IViewportRange) => {
			this._tooltipCallback(event, uri, location, handler);
		};
		const options: ILinkMatcherOptions = {
			matchIndex,
			tooltipCallback,
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
			const wrappedHandler = this._wrapLinkHandler(link => {
				this._handleHypertextLink(link);
			});
			const tooltipCallback = (event: MouseEvent, uri: string, location: IViewportRange) => {
				this._tooltipCallback(event, uri, location, this._handleHypertextLink.bind(this));
			};
			this._webLinksAddon = new WebLinksAddon(wrappedHandler, {
				validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateWebLink(callback),
				tooltipCallback,
				willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e)
			});
			this._xterm.loadAddon(this._webLinksAddon);
		});
	}

	public registerLocalLinkHandler(): void {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});
		const tooltipCallback = (event: MouseEvent, uri: string, location: IViewportRange) => {
			this._tooltipCallback(event, uri, location, this._handleLocalLink.bind(this));
		};
		this._linkMatchers.push(this._xterm.registerLinkMatcher(this._localLinkRegex, wrappedHandler, {
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateLocalLink(uri, callback),
			tooltipCallback,
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: LOCAL_LINK_PRIORITY
		}));
	}

	public registerGitDiffLinkHandlers(): void {
		const wrappedHandler = this._wrapLinkHandler(url => {
			this._handleLocalLink(url);
		});
		const tooltipCallback = (event: MouseEvent, uri: string, location: IViewportRange) => {
			this._tooltipCallback(event, uri, location, this._handleLocalLink.bind(this));
		};
		const options = {
			matchIndex: 1,
			validationCallback: (uri: string, callback: (isValid: boolean) => void) => this._validateLocalLink(uri, callback),
			tooltipCallback,
			willLinkActivate: (e: MouseEvent) => this._isLinkActivationModifierDown(e),
			priority: LOCAL_LINK_PRIORITY
		};
		this._linkMatchers.push(this._xterm.registerLinkMatcher(this._gitDiffPreImagePattern, wrappedHandler, options));
		this._linkMatchers.push(this._xterm.registerLinkMatcher(this._gitDiffPostImagePattern, wrappedHandler, options));
	}

	public registerLinkProvider(): void {
		// Web links
		const tooltipWebCallback = (event: MouseEvent, link: string, location: IViewportRange) => {
			this._tooltipCallback(event, link, location, this._handleProtocolLink.bind(this, link));
		};
		const wrappedActivateCallback = this._wrapLinkHandler(this._handleProtocolLink.bind(this));
		this._linkProviders.push(this._xterm.registerLinkProvider(
			new TerminalWebLinkProvider(this._xterm, wrappedActivateCallback, tooltipWebCallback)
		));

		// Validated local links
		const tooltipValidatedLocalCallback = (event: MouseEvent, link: string, location: IViewportRange) => {
			this._tooltipCallback(event, link, location, this._handleLocalLink.bind(this, link));
		};
		const wrappedTextLinkActivateCallback = this._wrapLinkHandler(this._handleLocalLink.bind(this));
		const wrappedDirectoryLinkActivateCallback = this._wrapLinkHandler2(this._handleLocalFolderLink.bind(this));
		this._linkProviders.push(this._xterm.registerLinkProvider(
			new TerminalValidatedLocalLinkProvider(
				this._xterm, this._processManager.os || OS,
				wrappedTextLinkActivateCallback,
				wrappedDirectoryLinkActivateCallback,
				tooltipValidatedLocalCallback,
				async (link, cb) => cb(await this._resolvePath(link)))
		));

		// Word links
		const wordHandler = async (link: string) => {
			const results = await this._searchService.fileSearch(
				this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
					filePattern: link,
					maxResults: 2
				})
			);

			// If there was exactly one match, open it
			if (results.results.length === 1) {
				const match = results.results[0];
				await this._editorService.openEditor({ resource: match.resource, options: { pinned: true } });
				return;
			}

			// Fallback to searching quick access
			this._quickInputService.quickAccess.show(link);
		};
		const tooltipWordCallback = (event: MouseEvent, link: string, location: IViewportRange) => {
			this._tooltipCallback(event, link, location, wordHandler);
		};
		const wrappedWordActivateCallback = this._wrapLinkHandler(wordHandler);
		this._linkProviders.push(this._xterm.registerLinkProvider(
			this._instantiationService.createInstance(TerminalWordLinkProvider, this._xterm, wrappedWordActivateCallback, tooltipWordCallback)
		));
	}

	protected _wrapLinkHandler(handler: (link: string) => void): XtermLinkMatcherHandler {
		return async (event: MouseEvent, link: string) => {
			// Prevent default electron link handling so Alt+Click mode works normally
			event.preventDefault();

			// Require correct modifier on click
			if (!this._isLinkActivationModifierDown(event)) {
				return;
			}

			// Allow the link to be intercepted if there are listeners
			if (this._hasBeforeHandleLinkListeners) {
				const wasHandled = await this._triggerBeforeHandleLinkListeners(link);
				if (!wasHandled) {
					handler(link);
				}
				return;
			}

			// Just call the handler if there is no before listener
			handler(link);
		};
	}

	protected _wrapLinkHandler2(handler: (uri: URI) => void): (event: MouseEvent, link: string, uri: URI) => Promise<void> {
		return async (event: MouseEvent, link: string, uri: URI) => {
			// Prevent default electron link handling so Alt+Click mode works normally
			event.preventDefault();

			// Require correct modifier on click
			if (!this._isLinkActivationModifierDown(event)) {
				return;
			}

			// Allow the link to be intercepted if there are listeners
			if (this._hasBeforeHandleLinkListeners) {
				const wasHandled = await this._triggerBeforeHandleLinkListeners(link);
				if (!wasHandled) {
					handler(uri);
				}
				return;
			}

			// Just call the handler if there is no before listener
			handler(uri);
		};
	}

	private async _triggerBeforeHandleLinkListeners(link: string): Promise<boolean> {
		return new Promise<boolean>(r => {
			const timeoutId = setTimeout(() => {
				canceled = true;
				this._logService.error(`An extension intecepted a terminal link but it timed out after ${TerminalLinkManager.LINK_INTERCEPT_THRESHOLD / 1000} seconds`);
				r(false);
			}, TerminalLinkManager.LINK_INTERCEPT_THRESHOLD);
			let canceled = false;
			const resolve = (handled: boolean) => {
				if (!canceled) {
					clearTimeout(timeoutId);
					r(handled);
				}
			};
			this._onBeforeHandleLink.fire({ link, resolve });
		});
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

	private async _handleLocalLink(link: string): Promise<void> {
		// TODO: This gets resolved again but doesn't need to as it's already validated
		const resolvedLink = await this._resolvePath(link);
		if (!resolvedLink) {
			return;
		}
		const lineColumnInfo: LineColumnInfo = this.extractLineColumnInfo(link);
		const selection: ITextEditorSelection = {
			startLineNumber: lineColumnInfo.lineNumber,
			startColumn: lineColumnInfo.columnNumber
		};
		await this._editorService.openEditor({ resource: resolvedLink.uri, options: { pinned: true, selection } });
	}

	private async _handleLocalFolderLink(uri: URI): Promise<void> {
		// If the folder is within one of the window's workspaces, focus it in the explorer
		const folders = this._workspaceContextService.getWorkspace().folders;
		for (let i = 0; i < folders.length; i++) {
			if (isEqualOrParent(uri, folders[0].uri)) {
				await this._commandService.executeCommand('revealInExplorer', uri);
				return;
			}
		}

		// Open a new window for the folder
		this._hostService.openWindow([{ folderUri: uri }], { forceNewWindow: true });
	}

	private _validateLocalLink(link: string, callback: (isValid: boolean) => void): void {
		this._resolvePath(link).then(resolvedLink => callback(!!resolvedLink));
	}

	private _validateWebLink(callback: (isValid: boolean) => void): void {
		callback(true);
	}

	private _handleHypertextLink(url: string): void {
		this._openerService.open(url, { allowTunneling: !!(this._processManager && this._processManager.remoteAuthority) });
	}

	private async _handleProtocolLink(link: string): Promise<void> {
		// Check if it's a file:/// link, hand off to local link handler so to open an editor and
		// respect line/col attachment
		const uri = URI.parse(link);
		if (uri.scheme === 'file') {
			this._handleLocalLink(uri.fsPath);
			return;
		}

		// Open as a web link if it's not a file
		this._handleHypertextLink(link);
	}

	protected _isLinkActivationModifierDown(event: MouseEvent): boolean {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}

	private _getLinkHoverString(uri: string): IMarkdownString {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');

		let label = '';
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			if (isMacintosh) {
				label = nls.localize('terminalLinkHandler.followLinkAlt.mac', "option + click");
			} else {
				label = nls.localize('terminalLinkHandler.followLinkAlt', "alt + click");
			}
		} else {
			if (isMacintosh) {
				label = nls.localize('terminalLinkHandler.followLinkCmd', "cmd + click");
			} else {
				label = nls.localize('terminalLinkHandler.followLinkCtrl', "ctrl + click");
			}
		}

		return new MarkdownString(`[Follow Link](${uri}) (${label})`, true);
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
				} else {
					// Remove \\?\ from paths so that they share the same underlying
					// uri and don't open multiple tabs for the same file
					link = link.replace(/^\\\\\?\\/, '');
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

	private async _resolvePath(link: string): Promise<{ uri: URI, isDirectory: boolean } | undefined> {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}

		const preprocessedLink = this._preprocessPath(link);
		if (!preprocessedLink) {
			return undefined;
		}

		const linkUrl = this.extractLinkUrl(preprocessedLink);
		if (!linkUrl) {
			return undefined;
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

			try {
				const stat = await this._fileService.resolve(uri);
				return { uri, isDirectory: stat.isDirectory };
			}
			catch (e) {
				// Does not exist
				return undefined;
			}
		} catch {
			// Errors in parsing the path
			return undefined;
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
