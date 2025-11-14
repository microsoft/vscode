/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from '../../../../../base/browser/dom.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { ITerminalLinkDetector, ITerminalLinkOpener, ITerminalLinkResolver, ITerminalSimpleLink, OmitFirstArg, TerminalBuiltinLinkType, TerminalLinkType } from './links.js';
import { TerminalExternalLinkDetector } from './terminalExternalLinkDetector.js';
import { TerminalLink } from './terminalLink.js';
import { TerminalLinkDetectorAdapter } from './terminalLinkDetectorAdapter.js';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalLocalFolderOutsideWorkspaceLinkOpener, TerminalSearchLinkOpener, TerminalUrlLinkOpener } from './terminalLinkOpeners.js';
import { TerminalLocalLinkDetector } from './terminalLocalLinkDetector.js';
import { TerminalUriLinkDetector } from './terminalUriLinkDetector.js';
import { TerminalWordLinkDetector } from './terminalWordLinkDetector.js';
import { ITerminalConfigurationService, ITerminalExternalLinkProvider, TerminalLinkQuickPickEvent } from '../../../terminal/browser/terminal.js';
import { ILinkHoverTargetOptions, TerminalHover } from '../../../terminal/browser/widgets/terminalHoverWidget.js';
import { TerminalWidgetManager } from '../../../terminal/browser/widgets/widgetManager.js';
import { IXtermCore } from '../../../terminal/browser/xterm-private.js';
import { ITerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalConfiguration, ITerminalProcessInfo, TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import type { ILink, ILinkProvider, IViewportRange, Terminal } from '@xterm/xterm';
import { convertBufferRangeToViewport } from './terminalLinkHelpers.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalMultiLineLinkDetector } from './terminalMultiLineLinkDetector.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import type { IHoverAction } from '../../../../../base/browser/ui/hover/hover.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

export type XtermLinkMatcherHandler = (event: MouseEvent | undefined, link: string) => Promise<void>;

/**
 * An object responsible for managing registration of link matchers and link providers.
 */
export class TerminalLinkManager extends DisposableStore {
	private _widgetManager: TerminalWidgetManager | undefined;
	private readonly _standardLinkProviders: Map<string, ILinkProvider> = new Map();
	private readonly _linkProvidersDisposables: IDisposable[] = [];
	private readonly _externalLinkProviders: IDisposable[] = [];
	private readonly _openers: Map<TerminalLinkType, ITerminalLinkOpener> = new Map();

	externalProvideLinksCb?: OmitFirstArg<ITerminalExternalLinkProvider['provideLinks']>;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _processInfo: ITerminalProcessInfo,
		capabilities: ITerminalCapabilityStore,
		private readonly _linkResolver: ITerminalLinkResolver,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalConfigurationService terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITunnelService private readonly _tunnelService: ITunnelService,
	) {
		super();

		let enableFileLinks: boolean = true;
		const enableFileLinksConfig = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).enableFileLinks as ITerminalConfiguration['enableFileLinks'] | boolean;
		switch (enableFileLinksConfig) {
			case 'off':
			case false: // legacy from v1.75
				enableFileLinks = false;
				break;
			case 'notRemote':
				enableFileLinks = !this._processInfo.remoteAuthority;
				break;
		}

		// Setup link detectors in their order of priority
		if (enableFileLinks) {
			this._setupLinkDetector(TerminalMultiLineLinkDetector.id, this._instantiationService.createInstance(TerminalMultiLineLinkDetector, this._xterm, this._processInfo, this._linkResolver));
			this._setupLinkDetector(TerminalLocalLinkDetector.id, this._instantiationService.createInstance(TerminalLocalLinkDetector, this._xterm, capabilities, this._processInfo, this._linkResolver));
		}
		this._setupLinkDetector(TerminalUriLinkDetector.id, this._instantiationService.createInstance(TerminalUriLinkDetector, this._xterm, this._processInfo, this._linkResolver));
		this._setupLinkDetector(TerminalWordLinkDetector.id, this.add(this._instantiationService.createInstance(TerminalWordLinkDetector, this._xterm)));

		// Setup link openers
		const localFileOpener = this._instantiationService.createInstance(TerminalLocalFileLinkOpener);
		const localFolderInWorkspaceOpener = this._instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
		const localFolderOutsideWorkspaceOpener = this._instantiationService.createInstance(TerminalLocalFolderOutsideWorkspaceLinkOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFile, localFileOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderInWorkspace, localFolderInWorkspaceOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderOutsideWorkspace, localFolderOutsideWorkspaceOpener);
		this._openers.set(TerminalBuiltinLinkType.Search, this._instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, this._processInfo.initialCwd, localFileOpener, localFolderInWorkspaceOpener, () => this._processInfo.os || OS));
		this._openers.set(TerminalBuiltinLinkType.Url, this._instantiationService.createInstance(TerminalUrlLinkOpener, !!this._processInfo.remoteAuthority, localFileOpener, localFolderInWorkspaceOpener, localFolderOutsideWorkspaceOpener));
		this._registerStandardLinkProviders();

		let activeHoverDisposable: IDisposable | undefined;
		let activeTooltipScheduler: RunOnceScheduler | undefined;
		this.add(toDisposable(() => {
			this._clearLinkProviders();
			dispose(this._externalLinkProviders);
			activeHoverDisposable?.dispose();
			activeTooltipScheduler?.dispose();
		}));
		this._xterm.options.linkHandler = {
			allowNonHttpProtocols: true,
			activate: async (event, text) => {
				if (!this._isLinkActivationModifierDown(event)) {
					return;
				}
				const colonIndex = text.indexOf(':');
				if (colonIndex === -1) {
					throw new Error(`Could not find scheme in link "${text}"`);
				}
				const scheme = text.substring(0, colonIndex);
				if (terminalConfigurationService.config.allowedLinkSchemes.indexOf(scheme) === -1) {
					const userAllowed = await new Promise<boolean>((resolve) => {
						notificationService.prompt(Severity.Warning, nls.localize('scheme', 'Opening URIs can be insecure, do you want to allow opening links with the scheme {0}?', scheme), [
							{
								label: nls.localize('allow', 'Allow {0}', scheme),
								run: () => {
									const allowedLinkSchemes = [
										...terminalConfigurationService.config.allowedLinkSchemes,
										scheme
									];
									this._configurationService.updateValue(`terminal.integrated.allowedLinkSchemes`, allowedLinkSchemes);
									resolve(true);
								}
							}
						], {
							onCancel: () => resolve(false)
						});
					});

					if (!userAllowed) {
						return;
					}
				}
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
					interface XtermWithCore extends Terminal {
						_core: IXtermCore;
					}
					const core = (this._xterm as XtermWithCore)._core;
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
		const detectorAdapter = this.add(this._instantiationService.createInstance(TerminalLinkDetectorAdapter, detector));
		this.add(detectorAdapter.onDidActivateLink(e => {
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
		}));
		this.add(detectorAdapter.onDidShowHover(e => this._tooltipCallback(e.link, e.viewportRange, e.modifierDownCallback, e.modifierUpCallback)));
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
		this._telemetryService.publicLog2<{
			linkType: TerminalBuiltinLinkType | string;
		}, {
			owner: 'tyriar';
			comment: 'When the user opens a link in the terminal';
			linkType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of link being opened' };
		}>('terminal/openLink', { linkType: typeof link.type === 'string' ? link.type : `extension:${link.type.id}` });
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

	async getLinks(): Promise<{ viewport: IDetectedLinks; all: Promise<IDetectedLinks> }> {
		// Fetch and await the viewport results
		const viewportLinksByLinePromises: Promise<IDetectedLinks | undefined>[] = [];
		for (let i = this._xterm.buffer.active.viewportY + this._xterm.rows - 1; i >= this._xterm.buffer.active.viewportY; i--) {
			viewportLinksByLinePromises.push(this._getLinksForLine(i));
		}
		const viewportLinksByLine = await Promise.all(viewportLinksByLinePromises);

		// Assemble viewport links
		const viewportLinks: Required<Pick<IDetectedLinks, 'wordLinks' | 'webLinks' | 'fileLinks' | 'folderLinks'>> = {
			wordLinks: [],
			webLinks: [],
			fileLinks: [],
			folderLinks: [],
		};
		for (const links of viewportLinksByLine) {
			if (links) {
				const { wordLinks, webLinks, fileLinks, folderLinks } = links;
				if (wordLinks?.length) {
					viewportLinks.wordLinks.push(...wordLinks.reverse());
				}
				if (webLinks?.length) {
					viewportLinks.webLinks.push(...webLinks.reverse());
				}
				if (fileLinks?.length) {
					viewportLinks.fileLinks.push(...fileLinks.reverse());
				}
				if (folderLinks?.length) {
					viewportLinks.folderLinks.push(...folderLinks.reverse());
				}
			}
		}

		// Fetch the remaining results async
		const aboveViewportLinksPromises: Promise<IDetectedLinks | undefined>[] = [];
		for (let i = this._xterm.buffer.active.viewportY - 1; i >= 0; i--) {
			aboveViewportLinksPromises.push(this._getLinksForLine(i));
		}
		const belowViewportLinksPromises: Promise<IDetectedLinks | undefined>[] = [];
		for (let i = this._xterm.buffer.active.length - 1; i >= this._xterm.buffer.active.viewportY + this._xterm.rows; i--) {
			belowViewportLinksPromises.push(this._getLinksForLine(i));
		}

		// Assemble all links in results
		const allLinks: Promise<Required<Pick<IDetectedLinks, 'wordLinks' | 'webLinks' | 'fileLinks' | 'folderLinks'>>> = Promise.all(aboveViewportLinksPromises).then(async aboveViewportLinks => {
			const belowViewportLinks = await Promise.all(belowViewportLinksPromises);
			const allResults: Required<Pick<IDetectedLinks, 'wordLinks' | 'webLinks' | 'fileLinks' | 'folderLinks'>> = {
				wordLinks: [...viewportLinks.wordLinks],
				webLinks: [...viewportLinks.webLinks],
				fileLinks: [...viewportLinks.fileLinks],
				folderLinks: [...viewportLinks.folderLinks]
			};
			for (const links of [...belowViewportLinks, ...aboveViewportLinks]) {
				if (links) {
					const { wordLinks, webLinks, fileLinks, folderLinks } = links;
					if (wordLinks?.length) {
						allResults.wordLinks.push(...wordLinks.reverse());
					}
					if (webLinks?.length) {
						allResults.webLinks.push(...webLinks.reverse());
					}
					if (fileLinks?.length) {
						allResults.fileLinks.push(...fileLinks.reverse());
					}
					if (folderLinks?.length) {
						allResults.folderLinks.push(...folderLinks.reverse());
					}
				}
			}
			return allResults;
		});

		return {
			viewport: viewportLinks,
			all: allLinks
		};
	}

	private async _getLinksForLine(y: number): Promise<IDetectedLinks | undefined> {
		const unfilteredWordLinks = await this._getLinksForType(y, 'word');
		const webLinks = await this._getLinksForType(y, 'url');
		const fileLinks = await this._getLinksForType(y, 'localFile');
		const folderLinks = await this._getLinksForType(y, 'localFolder');
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
		return { wordLinks, webLinks, fileLinks, folderLinks };
	}

	protected async _getLinksForType(y: number, type: 'word' | 'url' | 'localFile' | 'localFolder'): Promise<ILink[] | undefined> {
		switch (type) {
			case 'word':
				return (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalWordLinkDetector.id)?.provideLinks(y, r)));
			case 'url':
				return (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalUriLinkDetector.id)?.provideLinks(y, r)));
			case 'localFile': {
				const links = (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalLocalLinkDetector.id)?.provideLinks(y, r)));
				return links?.filter(link => (link as TerminalLink).type === TerminalBuiltinLinkType.LocalFile);
			}
			case 'localFolder': {
				const links = (await new Promise<ILink[] | undefined>(r => this._standardLinkProviders.get(TerminalLocalLinkDetector.id)?.provideLinks(y, r)));
				return links?.filter(link => (link as TerminalLink).type === TerminalBuiltinLinkType.LocalFolderInWorkspace);
			}
		}
	}

	private _tooltipCallback(link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) {
		if (!this._widgetManager) {
			return;
		}

		interface XtermWithCore extends Terminal {
			_core: IXtermCore;
		}
		const core = (this._xterm as XtermWithCore)._core;
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

	private _clearLinkProviders(): void {
		dispose(this._linkProvidersDisposables);
		this._linkProvidersDisposables.length = 0;
	}

	private _registerStandardLinkProviders(): void {
		// Forward any external link provider requests to the registered provider if it exists. This
		// helps maintain the relative priority of the link providers as it's defined by the order
		// in which they're registered in xterm.js.
		//
		/**
		 * There's a bit going on here but here's another view:
		 * - {@link externalProvideLinksCb} The external callback that gives the links (eg. from
		 *   exthost)
		 * - {@link proxyLinkProvider} A proxy that forwards the call over to
		 *   {@link externalProvideLinksCb}
		 * - {@link wrappedLinkProvider} Wraps the above in an `TerminalLinkDetectorAdapter`
		 */
		const proxyLinkProvider: OmitFirstArg<ITerminalExternalLinkProvider['provideLinks']> = async (bufferLineNumber) => {
			return this.externalProvideLinksCb?.(bufferLineNumber);
		};
		const detectorId = `extension-${this._externalLinkProviders.length}`;
		const wrappedLinkProvider = this._setupLinkDetector(detectorId, new TerminalExternalLinkDetector(detectorId, this._xterm, proxyLinkProvider), true);
		this._linkProvidersDisposables.push(this._xterm.registerLinkProvider(wrappedLinkProvider));

		for (const p of this._standardLinkProviders.values()) {
			this._linkProvidersDisposables.push(this._xterm.registerLinkProvider(p));
		}
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
}

export interface ILineColumnInfo {
	lineNumber: number;
	columnNumber: number;
}

export interface IDetectedLinks {
	wordLinks?: ILink[];
	webLinks?: ILink[];
	fileLinks?: (ILink | TerminalLink)[];
	folderLinks?: ILink[];
}
