/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import { IAction, IActionRunner, ActionRunner } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import dom = require('vs/base/browser/dom');
import { IContextMenuService, IContextMenuDelegate, ContextSubMenu, IEvent } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

import { remote, webFrame } from 'electron';

export class ContextMenuService implements IContextMenuService {

	public _serviceBrand: any;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		delegate.getActions().then(actions => {
			if (!actions.length) {
				return TPromise.as(null);
			}

			return TPromise.timeout(0).then(() => { // https://github.com/Microsoft/vscode/issues/3638
				const menu = this.createMenu(delegate, actions);
				const anchor = delegate.getAnchor();
				let x: number, y: number;

				if (dom.isHTMLElement(anchor)) {
					let elementPosition = dom.getDomNodePagePosition(anchor);

					x = elementPosition.left;
					y = elementPosition.top + elementPosition.height;
				} else {
					const pos = <{ x: number; y: number; }>anchor;
					x = pos.x;
					y = pos.y;
				}

				let zoom = webFrame.getZoomFactor();
				x *= zoom;
				y *= zoom;

				menu.popup(remote.getCurrentWindow(), Math.floor(x), Math.floor(y));
				if (delegate.onHide) {
					delegate.onHide(undefined);
				}
			});
		});
	}

	private createMenu(delegate: IContextMenuDelegate, entries: (IAction | ContextSubMenu)[]): Electron.Menu {
		const menu = new remote.Menu();
		const actionRunner = delegate.actionRunner || new ActionRunner();

		entries.forEach(e => {
			if (e instanceof Separator) {
				menu.append(new remote.MenuItem({ type: 'separator' }));
			} else if (e instanceof ContextSubMenu) {
				const submenu = new remote.MenuItem({
					submenu: this.createMenu(delegate, e.entries),
					label: e.label
				});

				menu.append(submenu);
			} else {
				const options: Electron.MenuItemOptions = {
					label: e.label,
					checked: !!e.checked || !!e.radio,
					type: !!e.checked ? 'checkbox' : !!e.radio ? 'radio' : void 0,
					enabled: !!e.enabled,
					click: (menuItem, win, event) => {
						this.runAction(actionRunner, e, delegate, event);
					}
				};

				const keybinding = !!delegate.getKeyBinding ? delegate.getKeyBinding(e) : undefined;
				if (keybinding) {
					const electronAccelerator = keybinding.getElectronAccelerator();
					if (electronAccelerator) {
						options.accelerator = electronAccelerator;
					} else {
						const label = keybinding.getLabel();
						if (label) {
							options.label = `${options.label} (${label})`;
						}
					}
				}

				const item = new remote.MenuItem(options);

				menu.append(item);
			}
		});

		return menu;
	}

	private runAction(actionRunner: IActionRunner, actionToRun: IAction, delegate: IContextMenuDelegate, event: IEvent): void {
		this.telemetryService.publicLog('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });

		const context = delegate.getActionsContext ? delegate.getActionsContext(event) : event;
		const res = actionRunner.run(actionToRun, context) || TPromise.as(null);

		res.done(null, e => this.messageService.show(severity.Error, e));
	}
}
