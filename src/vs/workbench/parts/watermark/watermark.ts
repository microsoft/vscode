/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./watermark';
import {Builder, $} from 'vs/base/browser/builder';
import {IDisposable}  from 'vs/base/common/lifecycle';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';

const entries = [
	{
		text: nls.localize('watermark.showCommands', "Command Palette"),
		ids: ['workbench.action.showCommands']
	},
	{
		text: nls.localize('watermark.quickOpen', "Open File in Folder"),
		ids: ['workbench.action.quickOpen']
	},
	{
		text: nls.localize('watermark.moveLines', "Move Lines Up/Down"),
		ids: ['editor.action.moveLinesUpAction', 'editor.action.moveLinesDownAction']
	},
	{
		text: nls.localize('watermark.addCursor', "Add Cursors Above/Below"),
		ids: ['cursorColumnSelectUp', 'cursorColumnSelectDown']
	},
	{
		text: nls.localize('watermark.toggleTerminal', "Toggle Terminal"),
		ids: ['workbench.action.terminal.toggleTerminal']
	},
];

const UNBOUND = nls.localize('watermark.unboundCommand', "unbound");

export function create(container: Builder, keybindingService: IKeybindingService): IDisposable {
	const div = $(container)
		.div({
			'class': 'watermark',
		});
	function update() {
		$(div).clearChildren()
			.element('dl', {
			}, dl => entries.map(entry => {
				dl.element('dt', {}, dt => dt.text(entry.text));
				dl.element('dd', {}, dd => dd.text(
					entry.ids
						.map(id => keybindingService.lookupKeybindings(id)
							.map(k => keybindingService.getLabelFor(k))
							.join(', ') || UNBOUND)
						.join(' / ')
				));
			}));
	}
	update();
	return keybindingService.onDidUpdateKeybindings(update);
}
