/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { AccessibleViewProviderId } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal, isDetachedTerminalInstance } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { isTerminalProcessManager } from '../../../terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { TerminalLinksCommandId } from '../common/terminal.links.js';
import { ITerminalLinkProviderService } from './links.js';
import { IDetectedLinks, TerminalLinkManager } from './terminalLinkManager.js';
import { TerminalLinkProviderService } from './terminalLinkProviderService.js';
import { TerminalLinkQuickpick } from './terminalLinkQuickpick.js';
import { TerminalLinkResolver } from './terminalLinkResolver.js';

// #region Services

registerSingleton(ITerminalLinkProviderService, TerminalLinkProviderService, InstantiationType.Delayed);

// #endregion

// #region Terminal Contributions

class TerminalLinkContribution extends DisposableStore implements ITerminalContribution {
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

		// Set widget manager
		if (isTerminalProcessManager(this._ctx.processManager)) {
			const disposable = linkManager.add(Event.once(this._ctx.processManager.onProcessReady)(() => {
				linkManager.setWidgetManager(this._ctx.widgetManager);
				this.delete(disposable);
			}));
		} else {
			linkManager.setWidgetManager(this._ctx.widgetManager);
		}

		// Attach the external link provider to the instance and listen for changes
		if (!isDetachedTerminalInstance(this._ctx.instance)) {
			for (const linkProvider of this._terminalLinkProviderService.linkProviders) {
				linkManager.externalProvideLinksCb = linkProvider.provideLinks.bind(linkProvider, this._ctx.instance);
			}
			linkManager.add(this._terminalLinkProviderService.onDidAddLinkProvider(e => {
				linkManager.externalProvideLinksCb = e.provideLinks.bind(e, this._ctx.instance as ITerminalInstance);
			}));
		}
		linkManager.add(this._terminalLinkProviderService.onDidRemoveLinkProvider(() => linkManager.externalProvideLinksCb = undefined));
	}

	async showLinkQuickpick(extended?: boolean): Promise<void> {
		if (!this._terminalLinkQuickpick) {
			this._terminalLinkQuickpick = this.add(this._instantiationService.createInstance(TerminalLinkQuickpick));
			this._terminalLinkQuickpick.onDidRequestMoreLinks(() => {
				this.showLinkQuickpick(true);
			});
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

registerTerminalContribution(TerminalLinkContribution.ID, TerminalLinkContribution, true);

// #endregion

// #region Actions

const category = terminalStrings.actionCategory;

registerActiveInstanceAction({
	id: TerminalLinksCommandId.OpenDetectedLink,
	title: localize2('workbench.action.terminal.openDetectedLink', 'Open Detected Link...'),
	f1: true,
	category,
	precondition: TerminalContextKeys.terminalHasBeenCreated,
	keybinding: [{
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: TerminalContextKeys.focus
	}, {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))
	},
	],
	run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.showLinkQuickpick()
});
registerActiveInstanceAction({
	id: TerminalLinksCommandId.OpenWebLink,
	title: localize2('workbench.action.terminal.openLastUrlLink', 'Open Last URL Link'),
	metadata: {
		description: localize2('workbench.action.terminal.openLastUrlLink.description', 'Opens the last detected URL/URI link in the terminal')
	},
	f1: true,
	category,
	precondition: TerminalContextKeys.terminalHasBeenCreated,
	run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('url')
});
registerActiveInstanceAction({
	id: TerminalLinksCommandId.OpenFileLink,
	title: localize2('workbench.action.terminal.openLastLocalFileLink', 'Open Last Local File Link'),
	f1: true,
	category,
	precondition: TerminalContextKeys.terminalHasBeenCreated,
	run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('localFile')
});

// #endregion
