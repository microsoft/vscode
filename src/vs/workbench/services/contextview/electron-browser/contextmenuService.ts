/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, IActionRunner, ActionRunner } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

import { remote, webFrame } from 'electron';
import { unmnemonicLabel } from 'vs/base/common/labels';
import { Event, Emitter } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate, ContextSubMenu, IEvent } from 'vs/base/browser/contextmenu';
import { once } from 'vs/base/common/functional';

export class ContextMenuService implements IContextMenuService {

	public _serviceBrand: any;
	private _onDidContextMenu = new Emitter<void>();

	constructor(
		@INotificationService private notificationService: INotificationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
	}

	public get onDidContextMenu(): Event<void> {
		return this._onDidContextMenu.event;
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		delegate.getActions().then(actions => {
			if (!actions.length) {
				return TPromise.as(null);
			}

			return TPromise.timeout(0).then(() => { // https://github.com/Microsoft/vscode/issues/3638
				const onHide = once(() => {
					if (delegate.onHide) {
						delegate.onHide(undefined);
					}

					this._onDidContextMenu.fire();
				});

				const menu = this.createMenu(delegate, actions, onHide);
				const anchor = delegate.getAnchor();
				let x: number, y: number;

				if (dom.isHTMLElement(anchor)) {
					let elementPosition = dom.getDomNodePagePosition(anchor);

					x = elementPosition.left;
					y = elementPosition.top + elementPosition.height;
				} else {
					const pos = <{ x: number; y: number; }>anchor;
					x = pos.x + 1; /* prevent first item from being selected automatically under mouse */
					y = pos.y;
				}

				let zoom = webFrame.getZoomFactor();
				x *= zoom;
				y *= zoom;

				menu.popup({
					window: remote.getCurrentWindow(),
					x: Math.floor(x),
					y: Math.floor(y),
					positioningItem: delegate.autoSelectFirstItem ? 0 : void 0,
					callback: () => onHide()
				});
			});
		});
	}

	private createMenu(delegate: IContextMenuDelegate, entries: (IAction | ContextSubMenu)[], onHide: () => void): Electron.Menu {
		const menu = new remote.Menu();
		const actionRunner = delegate.actionRunner || new ActionRunner();

		entries.forEach(e => {
			if (e instanceof Separator) {
				menu.append(new remote.MenuItem({ type: 'separator' }));
			} else if (e instanceof ContextSubMenu) {
				const submenu = new remote.MenuItem({
					submenu: this.createMenu(delegate, e.entries, onHide),
					label: unmnemonicLabel(e.label)
				});

				menu.append(submenu);
			} else {
				const options: Electron.MenuItemConstructorOptions = {
					label: unmnemonicLabel(e.label),
					checked: !!e.checked || !!e.radio,
					type: !!e.checked ? 'checkbox' : !!e.radio ? 'radio' : void 0,
					enabled: !!e.enabled,
					click: (menuItem, win, event) => {

						// To preserve pre-electron-2.x behaviour, we first trigger
						// the onHide callback and then the action.
						// Fixes https://github.com/Microsoft/vscode/issues/45601
						onHide();

						// Run action which will close the menu
						this.runAction(actionRunner, e, delegate, event);
					}
				};

				const keybinding = !!delegate.getKeyBinding ? delegate.getKeyBinding(e) : this.keybindingService.lookupKeybinding(e.id);
				if (keybinding) {
					const electronAccelerator = keybinding.getElectronAccelerator();
					if (electronAccelerator) {
						options.accelerator = electronAccelerator;
					} else {
						const label = keybinding.getLabel();
						if (label) {
							options.label = `${options.label} [${label}]`;
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
		/* __GDPR__
			"workbenchActionExecuted" : {
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });

		const context = delegate.getActionsContext ? delegate.getActionsContext(event) : event;
		const res = actionRunner.run(actionToRun, context) || TPromise.as(null);

		res.done(null, e => this.notificationService.error(e));
	}
}
