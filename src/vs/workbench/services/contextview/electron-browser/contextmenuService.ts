/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
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
		delegate.getActions().then(actions => {
			if (!actions.length) {
				return TPromise.as(null);
			}

			let menu = new Menu();
			let actionToRun: actions.IAction = null;

			actions.forEach(a => {
				if (a instanceof Separator) {
					menu.append(new MenuItem({ type: 'separator' }));
				} else {
					const keybinding = !!delegate.getKeyBinding ? delegate.getKeyBinding(a) : undefined;
					const accelerator = keybinding && keybinding.toElectronAccelerator();

					const item = new MenuItem({
						label: a.label,
						checked: a.checked,
						accelerator,
						click: () => {
							actionToRun = a;
						}
					});

					item.enabled = a.enabled;
					menu.append(item);
				}
			});

			const anchor = delegate.getAnchor();
			let x: number, y: number;

			if (dom.isHTMLElement(anchor)) {
				const $anchor = $(<HTMLElement> anchor);
				const elementPosition = $anchor.getPosition();
				const elementSize = $anchor.getTotalSize();

				x = elementPosition.left;
				y = elementPosition.top + elementSize.height;
			} else {
				const pos = <{ x: number; y: number; }> anchor;
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

			const context = delegate.getActionsContext ? delegate.getActionsContext() : null;
			return actionToRun.run(context) || TPromise.as(null);
		})
		.done(null, e => this.messageService.show(severity.Error, e));
	}
}