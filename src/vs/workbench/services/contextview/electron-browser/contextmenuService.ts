/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import severity from 'vs/base/common/severity';
import actions = require('vs/base/common/actions');
import {Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import dom = require('vs/base/browser/dom');
import {$} from 'vs/base/browser/builder';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import {IContextMenuService, IContextMenuDelegate} from 'vs/platform/contextview/browser/contextView';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IMessageService} from 'vs/platform/message/common/message';

import remote = require('remote');

const Menu = remote.require('menu');
const MenuItem = remote.require('menu-item');

export class ContextMenuService implements IContextMenuService {
	public serviceId = IContextMenuService;
	private telemetryService: ITelemetryService;
	private messageService: IMessageService;

	constructor(messageService: IMessageService, telemetryService: ITelemetryService) {
		this.messageService = messageService;
		this.telemetryService = telemetryService;
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		let menu = new Menu();
		let actionToRun: actions.IAction = null;

		delegate.getActions().done((actions: actions.IAction[]) => {
			actions.forEach(a => {
				if (a instanceof Separator) {
					menu.append(new MenuItem({ type: 'separator' }));
				} else {
					let keybinding = !!delegate.getKeyBinding ? delegate.getKeyBinding(a) : undefined;
					let accelerator: string;
					if (keybinding) {
						accelerator = keybinding.toElectronAccelerator();
					}

					let item = new MenuItem({
						label: a.label,
						checked: a.checked,
						accelerator: accelerator,
						click: () => {
							actionToRun = a;
						}
					});

					item.enabled = a.enabled;
					menu.append(item);
				}
			});
		});

		let anchor = delegate.getAnchor();
		let x: number, y: number;

		if (dom.isHTMLElement(anchor)) {
			let $anchor = $(<HTMLElement> anchor);
			let elementPosition = $anchor.getPosition();
			let elementSize = $anchor.getTotalSize();

			x = elementPosition.left;
			y = elementPosition.top + elementSize.height;
		} else {
			let pos = <{ x: number; y: number; }> anchor;
			x = pos.x;
			y = pos.y;
		}

		menu.popup(remote.getCurrentWindow(), Math.floor(x), Math.floor(y));

		if (delegate.onHide) {
			delegate.onHide(false);
		}

		if (!actionToRun) {
			return;
		}

		this.telemetryService.publicLog('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });
		let result = actionToRun.run(delegate.getActionsContext ? delegate.getActionsContext() : null);

		if (result) {
			result.done(null, e => this.messageService.show(severity.Error, e));
		}
	}
}