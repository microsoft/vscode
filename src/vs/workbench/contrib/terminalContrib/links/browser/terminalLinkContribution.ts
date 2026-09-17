/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal, isDetachedTerminalInstance } from '../../../terminal/browser/terminal.js';
import { IDetachedCompatibleTerminalContributionContext, ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { isTerminalProcessManager } from '../../../terminal/common/terminal.js';
import { ITerminalLinkProviderService } from './links.js';
import { IDetectedLinks, TerminalLinkManager } from './terminalLinkManager.js';
import { TerminalLinkQuickpick } from './terminalLinkQuickpick.js';
import { TerminalLinkResolver } from './terminalLinkResolver.js';

export class TerminalLinkContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.link';

	static get(instance: ITerminalInstance): TerminalLinkContribution | null {
		return instance.getContribution<TerminalLinkContribution>(TerminalLinkContribution.ID);
	}

	private _linkManager: TerminalLinkManager | undefined;
	private _terminalLinkQuickpick: TerminalLinkQuickpick | undefined;
	private _linkResolver: TerminalLinkResolver;

	constructor(
		private readonly _ctx: ITerminalContributionContext | IDetachedCompatibleTerminalContributionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalLinkProviderService private readonly _terminalLinkProviderService: ITerminalLinkProviderService,
	) {
		super();
		this._linkResolver = this._instantiationService.createInstance(TerminalLinkResolver);
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const linkManager = this._linkManager = this.add(this._instantiationService.createInstance(TerminalLinkManager, xterm.raw, this._ctx.processManager, this._ctx.instance.capabilities, this._linkResolver));

		if (isTerminalProcessManager(this._ctx.processManager)) {
			const disposable = linkManager.add(Event.once(this._ctx.processManager.onProcessReady)(() => {
				linkManager.setWidgetManager(this._ctx.widgetManager);
				this.delete(disposable);
			}));
		} else {
			linkManager.setWidgetManager(this._ctx.widgetManager);
		}

		const instance = this._ctx.instance;
		if (!isDetachedTerminalInstance(instance)) {
			for (const linkProvider of this._terminalLinkProviderService.linkProviders) {
				linkManager.externalProvideLinksCb = linkProvider.provideLinks.bind(linkProvider, instance);
			}
			linkManager.add(this._terminalLinkProviderService.onDidAddLinkProvider(e => {
				linkManager.externalProvideLinksCb = e.provideLinks.bind(e, instance);
			}));
			linkManager.add(this._terminalLinkProviderService.onDidRemoveLinkProvider(() => linkManager.externalProvideLinksCb = undefined));
		}
	}

	async showLinkQuickpick(extended?: boolean): Promise<void> {
		if (!this._terminalLinkQuickpick) {
			this._terminalLinkQuickpick = this.add(this._instantiationService.createInstance(TerminalLinkQuickpick));
			this.add(this._terminalLinkQuickpick.onDidRequestMoreLinks(() => {
				this.showLinkQuickpick(true);
			}));
		}
		const links = await this._getLinks();
		return await this._terminalLinkQuickpick.show(this._ctx.instance, links);
	}

	private async _getLinks(): Promise<{ viewport: IDetectedLinks; all: Promise<IDetectedLinks> }> {
		if (!this._linkManager) {
			throw new Error('terminal links are not ready, cannot generate link quick pick');
		}
		return this._linkManager.getLinks();
	}

	async openRecentLink(type: 'localFile' | 'url'): Promise<void> {
		if (!this._linkManager) {
			throw new Error('terminal links are not ready, cannot open a link');
		}
		this._linkManager.openRecentLink(type);
	}
}
