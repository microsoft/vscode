/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalLinkResolverService } from 'vs/workbench/contrib/terminal/contrib/links/browser/terminalLinkResolverService';
import { ITerminalLinkResolverService } from 'vs/workbench/contrib/terminal/contrib/links/browser/links';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalCommon';

registerSingleton(ITerminalLinkResolverService, TerminalLinkResolverService, InstantiationType.Delayed);

class TerminalLinkContribution extends DisposableStore implements ITerminalContribution {
	constructor(instance: ITerminalInstance) {
		super();
		console.log('ctor');
		this.add(toDisposable(() => console.log('dispose')));
	}
	xtermReady(xterm: IXtermTerminal): void {
		console.log('xtermReady');
		// TODO: Init terminal link manager here
	}
}
registerTerminalContribution('link', TerminalLinkContribution);

const category = terminalStrings.actionCategory;

// TODO: Move methods out of ITerminalInstance
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
		accessor.get(ITerminalService).doWithActiveInstance(t => t.showLinkQuickpick());
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
		accessor.get(ITerminalService).doWithActiveInstance(t => t.openRecentLink('url'));
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
		accessor.get(ITerminalService).doWithActiveInstance(t => t.openRecentLink('localFile'));
	}
});
