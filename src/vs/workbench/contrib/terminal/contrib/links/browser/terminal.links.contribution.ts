/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalLinkResolverService } from 'vs/workbench/contrib/terminal/contrib/links/browser/terminalLinkResolverService';
import { ITerminalLinkProviderService, ITerminalLinkResolverService } from 'vs/workbench/contrib/terminal/contrib/links/browser/links';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { IDetectedLinks, TerminalLinkManager } from 'vs/workbench/contrib/terminal/contrib/links/browser/terminalLinkManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalLinkQuickpick } from 'vs/workbench/contrib/terminal/contrib/links/browser/terminalLinkQuickpick';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { TerminalLinkProviderService } from 'vs/workbench/contrib/terminal/contrib/links/browser/terminalLinkProviderService';

registerSingleton(ITerminalLinkProviderService, TerminalLinkProviderService, InstantiationType.Delayed);
registerSingleton(ITerminalLinkResolverService, TerminalLinkResolverService, InstantiationType.Delayed);

class TerminalLinkContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.link';

	static get(instance: ITerminalInstance): TerminalLinkContribution | null {
		return instance.getContribution<TerminalLinkContribution>(TerminalLinkContribution.ID);
	}

	private _linkManager: TerminalLinkManager | undefined;
	get linkManager(): TerminalLinkManager | undefined { return this._linkManager; }

	private _terminalLinkQuickpick: TerminalLinkQuickpick | undefined;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _processManager: ITerminalProcessManager,
		private readonly _widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalLinkProviderService private readonly _terminalLinkProviderService: ITerminalLinkProviderService
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal): void {
		const linkManager = this._instantiationService.createInstance(TerminalLinkManager, (xterm as any).raw, this._processManager, this._instance.capabilities);
		this._processManager.onProcessReady(() => {
			linkManager.setWidgetManager(this._widgetManager);
		});
		this._linkManager = linkManager;

		// Attach the link provider(s) to the instance and listen for changes
		for (const linkProvider of this._terminalLinkProviderService.linkProviders) {
			this._linkManager.registerExternalLinkProvider(linkProvider.provideLinks.bind(linkProvider, this._instance));
		}
		this.add(this._terminalLinkProviderService.onDidAddLinkProvider(e => {
			linkManager.registerExternalLinkProvider(e.provideLinks.bind(e, this._instance));
		}));
		// TODO: Currently only a single link provider is supported; the one registered by the ext host
		this.add(this._terminalLinkProviderService.onDidRemoveLinkProvider(e => {
			linkManager.dispose();
			this.xtermReady(xterm);
		}));
	}

	async showLinkQuickpick(extended?: boolean): Promise<void> {
		if (!this._terminalLinkQuickpick) {
			this._terminalLinkQuickpick = this.add(this._instantiationService.createInstance(TerminalLinkQuickpick));
			this._terminalLinkQuickpick.onDidRequestMoreLinks(() => {
				this.showLinkQuickpick(true);
			});
		}
		const links = await this._getLinks(extended);
		if (!links) {
			return;
		}
		return await this._terminalLinkQuickpick.show(links);
	}

	private async _getLinks(extended?: boolean): Promise<IDetectedLinks | undefined> {
		if (!this._linkManager) {
			throw new Error('terminal links are not ready, cannot generate link quick pick');
		}
		return this._linkManager.getLinks(extended);
	}

	async openRecentLink(type: 'localFile' | 'url'): Promise<void> {
		if (!this._linkManager) {
			throw new Error('terminal links are not ready, cannot open a link');
		}
		this._linkManager.openRecentLink(type);
	}
}

registerTerminalContribution(TerminalLinkContribution.ID, TerminalLinkContribution);

const category = terminalStrings.actionCategory;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.OpenDetectedLink,
			title: { value: localize('workbench.action.terminal.openDetectedLink', "Open Detected Link..."), original: 'Open Detected Link...' },
			f1: true,
			category,
			precondition: TerminalContextKeys.terminalHasBeenCreated,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: TerminalContextKeys.focus,
			}
		});
	}
	run(accessor: ServicesAccessor) {
		const instance = accessor.get(ITerminalService).activeInstance;
		if (instance) {
			TerminalLinkContribution.get(instance)?.showLinkQuickpick();
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.OpenWebLink,
			title: { value: localize('workbench.action.terminal.openLastUrlLink', "Open Last Url Link"), original: 'Open Last Url Link' },
			f1: true,
			category,
			precondition: TerminalContextKeys.terminalHasBeenCreated,
		});
	}
	run(accessor: ServicesAccessor) {
		const instance = accessor.get(ITerminalService).activeInstance;
		if (instance) {
			TerminalLinkContribution.get(instance)?.openRecentLink('url');
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.OpenFileLink,
			title: { value: localize('workbench.action.terminal.openLastLocalFileLink', "Open Last Local File Link"), original: 'Open Last Local File Link' },
			f1: true,
			category,
			precondition: TerminalContextKeys.terminalHasBeenCreated,
		});
	}
	run(accessor: ServicesAccessor) {
		const instance = accessor.get(ITerminalService).activeInstance;
		if (instance) {
			TerminalLinkContribution.get(instance)?.openRecentLink('localFile');
		}
	}
});
