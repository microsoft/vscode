/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionRunner, ActionRunner } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { webFrame } from 'electron';
import { unmnemonicLabel } from 'vs/base/common/labels';
import { Event, Emitter } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate, ContextSubMenu, IContextMenuEvent } from 'vs/base/browser/contextmenu';
import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextMenuItem } from 'vs/base/parts/contextmenu/common/contextmenu';
import { popup } from 'vs/base/parts/contextmenu/electron-browser/contextmenu';

export class ContextMenuService extends Disposable implements IContextMenuService {

	_serviceBrand: any;

	private _onDidContextMenu = this._register(new Emitter<void>());
	get onDidContextMenu(): Event<void> { return this._onDidContextMenu.event; }

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
	}

	showContextMenu(delegate: IContextMenuDelegate): void {
		const actions = delegate.getActions();
		if (actions.length) {
			const onHide = once(() => {
				if (delegate.onHide) {
					delegate.onHide(false);
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

			popup(menu, {
				x: Math.floor(x),
				y: Math.floor(y),
				positioningItem: delegate.autoSelectFirstItem ? 0 : undefined,
				onHide: () => onHide()
			});
		}
	}

	private createMenu(delegate: IContextMenuDelegate, entries: Array<IAction | ContextSubMenu>, onHide: () => void): IContextMenuItem[] {
		const actionRunner = delegate.actionRunner || new ActionRunner();

		return entries.map(entry => this.createMenuItem(delegate, entry, actionRunner, onHide));
	}

	private createMenuItem(delegate: IContextMenuDelegate, entry: IAction | ContextSubMenu, actionRunner: IActionRunner, onHide: () => void): IContextMenuItem {

		// Separator
		if (entry instanceof Separator) {
			return { type: 'separator' } as IContextMenuItem;
		}

		// Submenu
		if (entry instanceof ContextSubMenu) {
			return {
				label: unmnemonicLabel(entry.label),
				submenu: this.createMenu(delegate, entry.entries, onHide)
			} as IContextMenuItem;
		}

		// Normal Menu Item
		else {
			const item: IContextMenuItem = {
				label: unmnemonicLabel(entry.label),
				checked: !!entry.checked || !!entry.radio,
				type: !!entry.checked ? 'checkbox' : !!entry.radio ? 'radio' : undefined,
				enabled: !!entry.enabled,
				click: event => {

					// To preserve pre-electron-2.x behaviour, we first trigger
					// the onHide callback and then the action.
					// Fixes https://github.com/Microsoft/vscode/issues/45601
					onHide();

					// Run action which will close the menu
					this.runAction(actionRunner, entry, delegate, event);
				}
			};

			const keybinding = !!delegate.getKeyBinding ? delegate.getKeyBinding(entry) : this.keybindingService.lookupKeybinding(entry.id);
			if (keybinding) {
				const electronAccelerator = keybinding.getElectronAccelerator();
				if (electronAccelerator) {
					item.accelerator = electronAccelerator;
				} else {
					const label = keybinding.getLabel();
					if (label) {
						item.label = `${item.label} [${label}]`;
					}
				}
			}

			return item;
		}
	}

	private runAction(actionRunner: IActionRunner, actionToRun: IAction, delegate: IContextMenuDelegate, event: IContextMenuEvent): void {
		/* __GDPR__
			"workbenchActionExecuted" : {
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });

		const context = delegate.getActionsContext ? delegate.getActionsContext(event) : event;
		const res = actionRunner.run(actionToRun, context) || Promise.resolve(null);

		res.then(undefined, e => this.notificationService.error(e));
	}
}
