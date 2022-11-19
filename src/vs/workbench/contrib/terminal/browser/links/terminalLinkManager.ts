/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { posix, win32 } from 'vs/base/common/path';
import { isMacintosh, OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { ITerminalLinkDetector, ITerminalLinkOpener, ITerminalSimpleLink, OmitFirstArg, ResolvedLink, TerminalBuiltinLinkType, TerminalLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { TerminalExternalLinkDetector } from 'vs/workbench/contrib/terminal/browser/links/terminalExternalLinkDetector';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { TerminalLinkDetectorAdapter } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkDetectorAdapter';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalLocalFolderOutsideWorkspaceLinkOpener, TerminalSearchLinkOpener, TerminalUrlLinkOpener } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkOpeners';
import { lineAndColumnClause, TerminalLocalLinkDetector, unixLocalLinkClause, winDrivePrefix, winLocalLinkClause } from 'vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector';
import { TerminalUriLinkDetector } from 'vs/workbench/contrib/terminal/browser/links/terminalUriLinkDetector';
import { TerminalWordLinkDetector } from 'vs/workbench/contrib/terminal/browser/links/terminalWordLinkDetector';
import { ITerminalExternalLinkProvider, TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILinkHoverTargetOptions, TerminalHover } from 'vs/workbench/contrib/terminal/browser/widgets/terminalHoverWidget';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalConfiguration, ITerminalProcessManager, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { IHoverAction } from 'vs/workbench/services/hover/browser/hover';
import type { ILink, ILinkProvider, IViewportRange, Terminal } from 'xterm';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { RunOnceScheduler } from 'vs/base/common/async';

export type XtermLinkMatcherHandler = (event: MouseEvent | undefined, link: string) => Promise<void>;
export type XtermLinkMatcherValidationCallback = (uri: string, callback: (isValid: boolean) => void) => void;

interface IPath {
	join(...paths: string[]): string;
	normalize(path: string): string;
	sep: '\\' | '/';
}

/**
 * An object responsible for managing registration of link matchers and link providers.
 */
export class TerminalLinkManager extends DisposableStore {
	private _widgetManager: TerminalWidgetManager | undefined;
	private _processCwd: string | undefined;
	private readonly _standardLinkProviders: Map<string, ILinkProvider> = new Map();
	private readonly _linkProvidersDisposables: IDisposable[] = [];
	private readonly _externalLinkProviders: IDisposable[] = [];
	private readonly _openers: Map<TerminalLinkType, ITerminalLinkOpener> = new Map();

	// Link cache could be shared across all terminals, but that could lead to weird results when
	// both local and remote terminals are present
	private readonly _resolvedLinkCache = new LinkCache();

	private _lastTopLine: number | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _processManager: ITerminalProcessManager,
		capabilities: ITerminalCapabilityStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ITunnelService private readonly _tunnelService: ITunnelService
	) {
		super();

		// Setup link detectors in their order of priority
		this._setupLinkDetector(TerminalUriLinkDetector.id, this._instantiationService.createInstance(TerminalUriLinkDetector, this._xterm, this._resolvePath.bind(this)));
		if (this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).enableFileLinks) {
			this._setupLinkDetector(TerminalLocalLinkDetector.id, this._instantiationService.createInstance(TerminalLocalLinkDetector, this._xterm, capabilities, this._processManager.os || OS, this._resolvePath.bind(this)));
		}
		this._setupLinkDetector(TerminalWordLinkDetector.id, this._instantiationService.createInstance(TerminalWordLinkDetector, this._xterm));

		capabilities.get(TerminalCapability.CwdDetection)?.onDidChangeCwd(cwd => {
			this.processCwd = cwd;
		});

		// Setup link openers
		const localFileOpener = this._instantiationService.createInstance(TerminalLocalFileLinkOpener, this._processManager.os || OS);
		const localFolderInWorkspaceOpener = this._instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFile, localFileOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderInWorkspace, localFolderInWorkspaceOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderOutsideWorkspace, this._instantiationService.createInstance(TerminalLocalFolderOutsideWorkspaceLinkOpener));
		this._openers.set(TerminalBuiltinLinkType.Search, this._instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, this._processManager.getInitialCwd(), localFileOpener, localFolderInWorkspaceOpener, this._processManager.os || OS));
		this._openers.set(TerminalBuiltinLinkType.Url, this._instantiationService.createInstance(TerminalUrlLinkOpener, !!this._processManager.remoteAuthority));

		this._registerStandardLinkProviders();

		let activeHoverDisposable: IDisposable | undefined;
		let activeTooltipScheduler: RunOnceScheduler | undefined;
		this.add(toDisposable(() => {
			activeHoverDisposable?.dispose();
			activeTooltipScheduler?.dispose();
		}));
		this._xterm.options.linkHandler = {
			activate: (_, text) => {
				this._openers.get(TerminalBuiltinLinkType.Url)?.open({
					type: TerminalBuiltinLinkType.Url,
					text,
					bufferRange: null!,
					uri: URI.parse(text)
				});
			},
			hover: (e, text, range) => {
				activeHoverDisposable?.dispose();
				activeHoverDisposable = undefined;
				activeTooltipScheduler?.dispose();
				activeTooltipScheduler = new RunOnceScheduler(() => {
					const core = (this._xterm as any)._core as IXtermCore;
					const cellDimensions = {
						width: core._renderService.dimensions.css.cell.width,
						height: core._renderService.dimensions.css.cell.height
					};
					const terminalDimensions = {
						width: this._xterm.cols,
						height: this._xterm.rows
					};
					activeHoverDisposable = this._showHover({
						viewportRange: convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY),
						cellDimensions,
						terminalDimensions
					}, this._getLinkHoverString(text, text), undefined, (text) => this._xterm.options.linkHandler?.activate(e, text, range));
					// Clear out scheduler until next hover event
					activeTooltipScheduler?.dispose();
					activeTooltipScheduler = undefined;
				}, this._configurationService.getValue('workbench.hover.delay'));
				activeTooltipScheduler.schedule();
			}
		};
	}

	private _setupLinkDetector(id: string, detector: ITerminalLinkDetector, isExternal: boolean = false): ILinkProvider {
		const detectorAdapter = this._instantiationService.createInstance(TerminalLinkDetectorAdapter, detector);
		detectorAdapter.onDidActivateLink(e => {
			// Prevent default electron link handling so Alt+Click mode works normally
			e.event?.preventDefault();
			// Require correct modifier on click unless event is coming from linkQuickPick selection
			if (e.event && !(e.event instanceof TerminalLinkQuickPickEvent) && !this._isLinkActivationModifierDown(e.event)) {
				return;
			}
			// Just call the handler if there is no before listener
			if (e.link.activate) {
				// Custom activate call (external links only)
				e.link.activate(e.link.text);
			} else {
				this._openLink(e.link);
			}
		});
		detectorAdapter.onDidShowHover(e => this._tooltipCallback(e.link, e.viewportRange, e.modifierDownCallback, e.modifierUpCallback));
		if (!isExternal) {
			this._standardLinkProviders.set(id, detectorAdapter);
		}
		return detectorAdapter;
	}

	private async _openLink(link: ITerminalSimpleLink): Promise<void> {
		this._logService.debug('Opening link', link);
		const opener = this._openers.get(link.type);
		if (!opener) {
			throw new Error(`No matching opener for link type "${link.type}"`);
		}
		await opener.open(link);
	}

	async openRecentLink(type: 'localFile' | 'url'): Promise<ILink | undefined> {
		let links;
		let i = this._xterm.buffer.active.length;
		while ((!links || links.length === 0) && i >= this._xterm.buffer.active.viewportY) {
			links = await this._getLinksForType(i, type);
			i--;
		}

		if (!links || links.length < 1) {
			return undefined;
		}
		const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
		links[0].activate(event, links[0].text);
		return links[0];
	}

	async getLinks(extended?: boolean): Promise<IDetectedLinks> {
		const wordResults: ILink[] = [];
		const webResults: ILink[] = [];
		const fileResults: ILink[] = [];
		let noMoreResults: boolean = false;
		let topLine = !extended ? this._xterm.buffer.active.viewportY - Math.min(this._xterm.rows, 50) : this._lastTopLine! - 1000;
		if (topLine < 0 || topLine - Math.min(this._xterm.rows, 50) < 0) {
			noMoreResults = true;
		}
		if (topLine < 0) {
			topLine = 0;
		}
		this._lastTopLine = topLine;
		for (let i = this._xterm.buffer.active.length - 1; i >= topLine; i--) {
			const links = await this._getLinksForLine(i);
			if (links) {
				const { wordLinks, webLinks, fileLinks } = links;
				if (wordLinks && wordLinks.length) {
					wordResults.push(...wordLinks.reverse());
				}
				if (webLinks && webLinks.length) {
					webResults.push(...webLinks.reverse());
				}
				if (fileLinks && fileLinks.length) {
					fileResults.push(...fileLinks.reverse());
				}
			}
		}
		return { webLinks: webResults, fileLinks: fileResults, wordLinks: wordResults, noMoreResults };
	}

	private async _getLinksForLine(y: number): Promise<IDetectedLinks | undefined> {
		const unfilteredWordLinks = await this._getLinksForType(y, 'word');
		const webLinks = await this._getLinksForType(y, 'url');
		const fileLinks = await this._getLinksForType(y, 'localFile');
		const words = new Set();
		let wordLinks;
		if (unfilteredWordLinks) {
			wordLinks = [];
			for (const link of unfilteredWordLinks) {
				if (!words.has(link.text) && link.text.length > 1) {
					wordLinks.push(link);
					words.add(link.text);
				}
			}
		}
		return { wordLinks, webLinks, fileLinks };
	}

	protected async _getLinksForType(y: number, type: 'word' | 'url' | 'localFile'): Promise<ILink[] | undefined> {
		switch (type) {
			case 'word':
				return (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalWordLinkDetector.id)?.provideLinks(y, r)));
			case 'url':
				return (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalUriLinkDetector.id)?.provideLinks(y, r)));
			case 'localFile': {
				const links = (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalLocalLinkDetector.id)?.provideLinks(y, r)));
				return links?.filter(link => (link as TerminalLink).type === TerminalBuiltinLinkType.LocalFile);
			}
		}
	}

	private _tooltipCallback(link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) {
		if (!this._widgetManager) {
			return;
		}

		const core = (this._xterm as any)._core as IXtermCore;
		const cellDimensions = {
			width: core._renderService.dimensions.css.cell.width,
			height: core._renderService.dimensions.css.cell.height
		};
		const terminalDimensions = {
			width: this._xterm.cols,
			height: this._xterm.rows
		};

		// Don't pass the mouse event as this avoids the modifier check
		this._showHover({
			viewportRange,
			cellDimensions,
			terminalDimensions,
			modifierDownCallback,
			modifierUpCallback
		}, this._getLinkHoverString(link.text, link.label), link.actions, (text) => link.activate(undefined, text), link);
	}

	private _showHover(
		targetOptions: ILinkHoverTargetOptions,
		text: IMarkdownString,
		actions: IHoverAction[] | undefined,
		linkHandler: (url: string) => void,
		link?: TerminalLink
	): IDisposable | undefined {
		if (this._widgetManager) {
			const widget = this._instantiationService.createInstance(TerminalHover, targetOptions, text, actions, linkHandler);
			const attached = this._widgetManager.attachWidget(widget);
			if (attached) {
				link?.onInvalidated(() => attached.dispose());
			}
			return attached;
		}
		return undefined;
	}

	setWidgetManager(widgetManager: TerminalWidgetManager): void {
		this._widgetManager = widgetManager;
	}

	set processCwd(processCwd: string) {
		this._processCwd = processCwd;
	}

	private _clearLinkProviders(): void {
		dispose(this._linkProvidersDisposables);
		this._linkProvidersDisposables.length = 0;
	}

	private _registerStandardLinkProviders(): void {
		for (const p of this._standardLinkProviders.values()) {
			this._linkProvidersDisposables.push(this._xterm.registerLinkProvider(p));
		}
	}

	registerExternalLinkProvider(provideLinks: OmitFirstArg<ITerminalExternalLinkProvider['provideLinks']>): IDisposable {
		// Clear and re-register the standard link providers so they are a lower priority than the new one
		this._clearLinkProviders();
		const detectorId = `extension-${this._externalLinkProviders.length}`;
		const wrappedLinkProvider = this._setupLinkDetector(detectorId, new TerminalExternalLinkDetector(detectorId, this._xterm, provideLinks), true);
		const newLinkProvider = this._xterm.registerLinkProvider(wrappedLinkProvider);
		this._externalLinkProviders.push(newLinkProvider);
		this._registerStandardLinkProviders();
		return newLinkProvider;
	}

	protected get _localLinkRegex(): RegExp {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}
		const baseLocalLinkClause = this._processManager.os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
	}

	protected _isLinkActivationModifierDown(event: MouseEvent): boolean {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}

	private _getLinkHoverString(uri: string, label: string | undefined): IMarkdownString {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');

		let clickLabel = '';
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			if (isMacintosh) {
				clickLabel = nls.localize('terminalLinkHandler.followLinkAlt.mac', "option + click");
			} else {
				clickLabel = nls.localize('terminalLinkHandler.followLinkAlt', "alt + click");
			}
		} else {
			if (isMacintosh) {
				clickLabel = nls.localize('terminalLinkHandler.followLinkCmd', "cmd + click");
			} else {
				clickLabel = nls.localize('terminalLinkHandler.followLinkCtrl', "ctrl + click");
			}
		}

		let fallbackLabel = nls.localize('followLink', "Follow link");
		try {
			if (this._tunnelService.canTunnel(URI.parse(uri))) {
				fallbackLabel = nls.localize('followForwardedLink', "Follow link using forwarded port");
			}
		} catch {
			// No-op, already set to fallback
		}

		const markdown = new MarkdownString('', true);
		// Escapes markdown in label & uri
		if (label) {
			label = markdown.appendText(label).value;
			markdown.value = '';
		}
		if (uri) {
			uri = markdown.appendText(uri).value;
			markdown.value = '';
		}

		label = label || fallbackLabel;
		// Use the label when uri is '' so the link displays correctly
		uri = uri || label;
		// Although if there is a space in the uri, just replace it completely
		if (/(\s|&nbsp;)/.test(uri)) {
			uri = nls.localize('followLinkUrl', 'Link');
		}

		return markdown.appendLink(uri, label).appendMarkdown(` (${clickLabel})`);
	}

	private get _osPath(): IPath {
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
			link = this._osPath.join(this._processManager.userHome, link.substring(1));
		} else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
			if (this._processManager.os === OperatingSystem.Windows) {
				if (!link.match('^' + winDrivePrefix) && !link.startsWith('\\\\?\\')) {
					if (!this._processCwd) {
						// Abort if no workspace is open
						return null;
					}
					link = this._osPath.join(this._processCwd, link);
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
				link = this._osPath.join(this._processCwd, link);
			}
		}
		link = this._osPath.normalize(link);

		return link;
	}

	private async _resolvePath(link: string, uri?: URI): Promise<ResolvedLink> {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}

		// Check resolved link cache first
		const cached = this._resolvedLinkCache.get(uri || link);
		if (cached !== undefined) {
			return cached;
		}

		if (uri) {
			try {
				const stat = await this._fileService.stat(uri);
				const result = { uri, link, isDirectory: stat.isDirectory };
				this._resolvedLinkCache.set(uri, result);
				return result;
			}
			catch (e) {
				// Does not exist
				this._resolvedLinkCache.set(uri, null);
				return null;
			}
		}

		const preprocessedLink = this._preprocessPath(link);
		if (!preprocessedLink) {
			this._resolvedLinkCache.set(link, null);
			return null;
		}

		const linkUrl = this.extractLinkUrl(preprocessedLink);
		if (!linkUrl) {
			this._resolvedLinkCache.set(link, null);
			return null;
		}

		try {
			let uri: URI;
			if (this._processManager.remoteAuthority) {
				uri = URI.from({
					scheme: Schemas.vscodeRemote,
					authority: this._processManager.remoteAuthority,
					path: linkUrl
				});
			} else {
				uri = URI.file(linkUrl);
			}

			try {
				const stat = await this._fileService.stat(uri);
				const result = { uri, link, isDirectory: stat.isDirectory };
				this._resolvedLinkCache.set(link, result);
				return result;
			}
			catch (e) {
				// Does not exist
				this._resolvedLinkCache.set(link, null);
				return null;
			}
		} catch {
			// Errors in parsing the path
			this._resolvedLinkCache.set(link, null);
			return null;
		}
	}

	/**
	 * Returns url from link as link may contain line and column information.
	 *
	 * @param link url link which may contain line and column number.
	 */
	extractLinkUrl(link: string): string | null {
		const matches: string[] | null = this._localLinkRegex.exec(link);
		if (!matches) {
			return null;
		}
		return matches[1];
	}
}

export interface ILineColumnInfo {
	lineNumber: number;
	columnNumber: number;
}

export interface IDetectedLinks {
	wordLinks?: ILink[];
	webLinks?: ILink[];
	fileLinks?: ILink[];
	noMoreResults?: boolean;
}

const enum LinkCacheConstants {
	/**
	 * How long to cache links for in milliseconds, the TTL resets whenever a new value is set in
	 * the cache.
	 */
	TTL = 10000
}

class LinkCache {
	private readonly _cache = new Map<string, ResolvedLink>();
	private _cacheTilTimeout = 0;

	set(link: string | URI, value: ResolvedLink) {
		// Reset cached link TTL on any set
		if (this._cacheTilTimeout) {
			window.clearTimeout(this._cacheTilTimeout);
		}
		this._cacheTilTimeout = window.setTimeout(() => this._cache.clear(), LinkCacheConstants.TTL);
		this._cache.set(this._getKey(link), value);
	}

	get(link: string | URI): ResolvedLink | undefined {
		return this._cache.get(this._getKey(link));
	}

	private _getKey(link: string | URI): string {
		if (URI.isUri(link)) {
			return link.toString();
		}
		return link;
	}
}
