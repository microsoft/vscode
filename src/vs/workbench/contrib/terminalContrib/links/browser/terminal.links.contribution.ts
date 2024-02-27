/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize2 } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AccessibleViewProviderId, accessibleViewCurrentProviderId, accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager, TerminalCommandId, isTerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { ITerminalLinkProviderService } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { IDetectedLinks, TerminalLinkManager } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager';
import { TerminalLinkProviderService } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkProviderService';
import { TerminalLinkQuickpick } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkQuickpick';
import { TerminalLinkResolver } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkResolver';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';

registerSingleton(ITerminalLinkProviderService, TerminalLinkProviderService, InstantiationType.Delayed);

class TerminalLinkContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.link';

	static get(instance: ITerminalInstance): TerminalLinkContribution | null {
		return instance.getContribution<TerminalLinkContribution>(TerminalLinkContribution.ID);
	}

	private _linkManager: TerminalLinkManager | undefined;
	private _terminalLinkQuickpick: TerminalLinkQuickpick | undefined;
	private _linkResolver: TerminalLinkResolver;

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		private readonly _processManager: ITerminalProcessManager | ITerminalProcessInfo,
		private readonly _widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalLinkProviderService private readonly _terminalLinkProviderService: ITerminalLinkProviderService
	) {
		super();
		this._linkResolver = this._instantiationService.createInstance(TerminalLinkResolver);
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const linkManager = this._linkManager = this.add(this._instantiationService.createInstance(TerminalLinkManager, xterm.raw, this._processManager, this._instance.capabilities, this._linkResolver));

		// Set widget manager
		if (isTerminalProcessManager(this._processManager)) {
			const disposable = linkManager.add(Event.once(this._processManager.onProcessReady)(() => {
				linkManager.setWidgetManager(this._widgetManager);
				this.delete(disposable);
			}));
		} else {
			linkManager.setWidgetManager(this._widgetManager);
		}

		// Attach the external link provider to the instance and listen for changes
		if (!isDetachedTerminalInstance(this._instance)) {
			for (const linkProvider of this._terminalLinkProviderService.linkProviders) {
				linkManager.externalProvideLinksCb = linkProvider.provideLinks.bind(linkProvider, this._instance);
			}
			linkManager.add(this._terminalLinkProviderService.onDidAddLinkProvider(e => {
				linkManager.externalProvideLinksCb = e.provideLinks.bind(e, this._instance as ITerminalInstance);
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
		return await this._terminalLinkQuickpick.show(this._instance, links);
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

const category = terminalStrings.actionCategory;

registerActiveInstanceAction({
	id: TerminalCommandId.OpenDetectedLink,
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
	id: TerminalCommandId.OpenWebLink,
	title: localize2('workbench.action.terminal.openLastUrlLink', 'Open Last URL Link'),
	f1: true,
	category,
	precondition: TerminalContextKeys.terminalHasBeenCreated,
	run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('url')
});
registerActiveInstanceAction({
	id: TerminalCommandId.OpenFileLink,
	title: localize2('workbench.action.terminal.openLastLocalFileLink', 'Open Last Local File Link'),
	f1: true,
	category,
	precondition: TerminalContextKeys.terminalHasBeenCreated,
	run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('localFile')
});
