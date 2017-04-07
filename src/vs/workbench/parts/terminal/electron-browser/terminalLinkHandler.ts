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
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TerminalWidgetManager } from 'vs/workbench/parts/terminal/browser/terminalWidgetManager';
import { TPromise } from 'vs/base/common/winjs.base';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;]'; // '":; are allowed in paths but they are often separators so ignore them
const escapedExcludedPathCharactersClause = '(\\\\s|\\\\!|\\\\$|\\\\`|\\\\&|\\\\*|(|)|\\+)';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const UNIX_LIKE_LOCAL_LINK_REGEX = new RegExp('((' + pathPrefix + '|(' + excludedPathCharactersClause + '|' + escapedExcludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + '|' + escapedExcludedPathCharactersClause + ')+)+)');
const winDrivePrefix = '[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const WINDOWS_LOCAL_LINK_REGEX = new RegExp('((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)');
/** Higher than local link, lower than hypertext */
const CUSTOM_LINK_PRIORITY = -1;
/** Lowest */
const LOCAL_LINK_PRIORITY = -2;

export type XtermLinkMatcherHandler = (event: MouseEvent, uri: string) => boolean | void;
export type XtermLinkMatcherValidationCallback = (uri: string, element: HTMLElement, callback: (isValid: boolean) => void) => void;

export class TerminalLinkHandler {
	private _tooltipDisposables: IDisposable[] = [];
	private _widgetManager: TerminalWidgetManager;

	constructor(
		private _xterm: any,
		private _platform: platform.Platform,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService
	) {
		this._xterm.setHypertextLinkHandler(this._wrapLinkHandler(() => true));
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
			return;
		});
		return this._xterm.registerLinkMatcher(this._localLinkRegex, wrappedHandler, {
			matchIndex: 1,
			validationCallback: (link: string, element: HTMLElement, callback: (isValid: boolean) => void) => this._validateLocalLink(link, element, callback),
			priority: LOCAL_LINK_PRIORITY
		});
	}

	public disposeTooltipListeners(): void {
		this._tooltipDisposables = dispose(this._tooltipDisposables);
	}

	private _wrapLinkHandler(handler: (uri: string) => boolean | void): XtermLinkMatcherHandler {
		return (event: MouseEvent, uri: string) => {
			// Require ctrl/cmd on click
			if (this._platform === platform.Platform.Mac ? !event.metaKey : !event.ctrlKey) {
				event.preventDefault();
				return false;
			}
			return handler(uri);
		};
	}

	protected get _localLinkRegex(): RegExp {
		if (this._platform === platform.Platform.Windows) {
			return WINDOWS_LOCAL_LINK_REGEX;
		}
		return UNIX_LIKE_LOCAL_LINK_REGEX;
	}

	private _handleLocalLink(link: string): TPromise<void> {
		return this._resolvePath(link).then(resolvedLink => {
			if (!resolvedLink) {
				return void 0;
			}
			const resource = Uri.file(path.normalize(path.resolve(resolvedLink)));
			return this._editorService.openEditor({ resource }).then(() => void 0);
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

	private _addTooltipEventListeners(element: HTMLElement): void {
		let timeout = null;
		let isMessageShowing = false;
		this._tooltipDisposables.push(dom.addDisposableListener(element, dom.EventType.MOUSE_OVER, () => {
			timeout = setTimeout(() => {
				let message: string;
				if (platform.isMacintosh) {
					message = nls.localize('terminalLinkHandler.followLinkCmd', 'Cmd + click to follow link');
				} else {
					message = nls.localize('terminalLinkHandler.followLinkCtrl', 'Ctrl + click to follow link');
				}
				this._widgetManager.showMessage(element.offsetLeft, element.offsetTop, message);
				isMessageShowing = true;
			}, 500);
		}));
		this._tooltipDisposables.push(dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => {
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
				if (!this._contextService.hasWorkspace()) {
					// Abort if no workspace is open
					return null;
				}
				link = path.join(this._contextService.getWorkspace().resource.fsPath, link);
			}
		}
		// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
		else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			if (!this._contextService.hasWorkspace()) {
				// Abort if no workspace is open
				return null;
			}
			link = path.join(this._contextService.getWorkspace().resource.fsPath, link);
		}
		return link;
	}

	private _resolvePath(link: string): TPromise<string> {
		link = this._preprocessPath(link);

		if (!link) {
			return TPromise.as(void 0);
		}

		// Open an editor if the path exists
		return pfs.fileExists(link).then(isFile => {
			if (!isFile) {
				return null;
			}
			return link;
		});
	}
}
