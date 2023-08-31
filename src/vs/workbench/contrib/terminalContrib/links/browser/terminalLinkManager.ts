/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType } from 'vs/base/browser/dom';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { ITerminalLinkDetector, ITerminalLinkOpener, ITerminalLinkResolver, ITerminalSimpleLink, OmitFirstArg, TerminalBuiltinLinkType, TerminalLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { TerminalExternalLinkDetector } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalExternalLinkDetector';
import { TerminalLink } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLink';
import { TerminalLinkDetectorAdapter } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkDetectorAdapter';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalLocalFolderOutsideWorkspaceLinkOpener, TerminalSearchLinkOpener, TerminalUrlLinkOpener } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkOpeners';
import { TerminalLocalLinkDetector } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLocalLinkDetector';
import { TerminalUriLinkDetector } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalUriLinkDetector';
import { TerminalWordLinkDetector } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalWordLinkDetector';
import { ITerminalExternalLinkProvider, TerminalLinkQuickPickEvent } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILinkHoverTargetOptions, TerminalHover } from 'vs/workbench/contrib/terminal/browser/widgets/terminalHoverWidget';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { ITerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalConfiguration, ITerminalProcessInfo, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { IHoverAction } from 'vs/workbench/services/hover/browser/hover';
import type { ILink, ILinkProvider, IViewportRange, Terminal } from 'xterm';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import { TerminalMultiLineLinkDetector } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalMultiLineLinkDetector';

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

	constructor(
		private readonly _xterm: Terminal,
		private readonly _processInfo: ITerminalProcessInfo,
		capabilities: ITerminalCapabilityStore,
		private readonly _linkResolver: ITerminalLinkResolver,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITunnelService private readonly _tunnelService: ITunnelService
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
		this._setupLinkDetector(TerminalUriLinkDetector.id, this._instantiationService.createInstance(TerminalUriLinkDetector, this._xterm, this._processInfo, this._linkResolver));
		if (enableFileLinks) {
			this._setupLinkDetector(TerminalMultiLineLinkDetector.id, this._instantiationService.createInstance(TerminalMultiLineLinkDetector, this._xterm, this._processInfo, this._linkResolver));
			this._setupLinkDetector(TerminalLocalLinkDetector.id, this._instantiationService.createInstance(TerminalLocalLinkDetector, this._xterm, capabilities, this._processInfo, this._linkResolver));
		}
		this._setupLinkDetector(TerminalWordLinkDetector.id, this.add(this._instantiationService.createInstance(TerminalWordLinkDetector, this._xterm)));

		// Setup link openers
		const localFileOpener = this._instantiationService.createInstance(TerminalLocalFileLinkOpener);
		const localFolderInWorkspaceOpener = this._instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFile, localFileOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderInWorkspace, localFolderInWorkspaceOpener);
		this._openers.set(TerminalBuiltinLinkType.LocalFolderOutsideWorkspace, this._instantiationService.createInstance(TerminalLocalFolderOutsideWorkspaceLinkOpener));
		this._openers.set(TerminalBuiltinLinkType.Search, this._instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, this._processInfo.initialCwd, localFileOpener, localFolderInWorkspaceOpener, () => this._processInfo.os || OS));
		this._openers.set(TerminalBuiltinLinkType.Url, this._instantiationService.createInstance(TerminalUrlLinkOpener, !!this._processInfo.remoteAuthority));

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
	fileLinks?: ILink[];
	folderLinks?: ILink[];
}
