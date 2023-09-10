/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionRunner, ActionRunner, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification, Separator, SubmenuAction } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuMenuDelegate, IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { getZoomFactor } from 'vs/base/browser/browser';
import { unmnemonicLabel } from 'vs/base/common/labels';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate, IContextMenuEvent } from 'vs/base/browser/contextmenu';
import { once } from 'vs/base/common/functional';
import { IContextMenuItem } from 'vs/base/parts/contextmenu/common/contextmenu';
import { popup } from 'vs/base/parts/contextmenu/electron-sandbox/contextmenu';
import { getTitleBarStyle } from 'vs/platform/window/common/window';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextMenuMenuDelegate, ContextMenuService as HTMLContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { stripIcons } from 'vs/base/common/iconLabels';
import { coalesce } from 'vs/base/common/arrays';
import { Event, Emitter } from 'vs/base/common/event';
import { AnchorAlignment, AnchorAxisAlignment, isAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';

export class ContextMenuService implements IContextMenuService {

	declare readonly _serviceBrand: undefined;

	private impl: HTMLContextMenuService | NativeContextMenuService;

	get onDidShowContextMenu(): Event<void> { return this.impl.onDidShowContextMenu; }
	get onDidHideContextMenu(): Event<void> { return this.impl.onDidHideContextMenu; }

	constructor(
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextViewService contextViewService: IContextViewService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		// Custom context menu: Linux/Windows if custom title is enabled
		if (!isMacintosh && getTitleBarStyle(configurationService) === 'custom') {
			this.impl = new HTMLContextMenuService(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
		}

		// Native context menu: otherwise
		else {
			this.impl = new NativeContextMenuService(notificationService, telemetryService, keybindingService, menuService, contextKeyService, configurationService);
		}
	}

	dispose(): void {
		this.impl.dispose();
	}

	showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {
		this.impl.showContextMenu(delegate);
	}
}

class NativeContextMenuService extends Disposable implements IContextMenuService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidShowContextMenu = this._store.add(new Emitter<void>());
	readonly onDidShowContextMenu = this._onDidShowContextMenu.event;

	private readonly _onDidHideContextMenu = this._store.add(new Emitter<void>());
	readonly onDidHideContextMenu = this._onDidHideContextMenu.event;

	private useNativeContextMenuLocation = false;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateUseNativeContextMenuLocation();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.experimental.nativeContextMenuLocation')) {
				this.updateUseNativeContextMenuLocation();
			}
		}));
	}

	private updateUseNativeContextMenuLocation(): void {
		this.useNativeContextMenuLocation = this.configurationService.getValue<boolean>('window.experimental.nativeContextMenuLocation') === true;
	}

	showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {

		delegate = ContextMenuMenuDelegate.transform(delegate, this.menuService, this.contextKeyService);

		const actions = delegate.getActions();
		if (actions.length) {
			const onHide = once(() => {
				delegate.onHide?.(false);

				dom.ModifierKeyEmitter.getInstance().resetKeyStatus();
				this._onDidHideContextMenu.fire();
			});

			const menu = this.createMenu(delegate, actions, onHide);
			const anchor = delegate.getAnchor();

			let x: number | undefined;
			let y: number | undefined;

			let zoom = getZoomFactor();
			if (dom.isHTMLElement(anchor)) {
				const elementPosition = dom.getDomNodePagePosition(anchor);

				// When drawing context menus, we adjust the pixel position for native menus using zoom level
				// In areas where zoom is applied to the element or its ancestors, we need to adjust accordingly
				// e.g. The title bar has counter zoom behavior meaning it applies the inverse of zoom level.
				// Window Zoom Level: 1.5, Title Bar Zoom: 1/1.5, Coordinate Multiplier: 1.5 * 1.0 / 1.5 = 1.0
				zoom *= dom.getDomNodeZoomLevel(anchor);

				// Position according to the axis alignment and the anchor alignment:
				// `HORIZONTAL` aligns at the top left or right of the anchor and
				//  `VERTICAL` aligns at the bottom left of the anchor.
				if (delegate.anchorAxisAlignment === AnchorAxisAlignment.HORIZONTAL) {
					if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
						x = elementPosition.left;
						y = elementPosition.top;
					} else {
						x = elementPosition.left + elementPosition.width;
						y = elementPosition.top;
					}

					if (!isMacintosh) {
						const availableHeightForMenu = window.screen.height - y;
						if (availableHeightForMenu < actions.length * (isWindows ? 45 : 32) /* guess of 1 menu item height */) {
							// this is a guess to detect whether the context menu would
							// open to the bottom from this point or to the top. If the
							// menu opens to the top, make sure to align it to the bottom
							// of the anchor and not to the top.
							// this seems to be only necessary for Windows and Linux.
							y += elementPosition.height;
						}
					}
				} else {
					if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
						x = elementPosition.left;
						y = elementPosition.top + elementPosition.height;
					} else {
						x = elementPosition.left + elementPosition.width;
						y = elementPosition.top + elementPosition.height;
					}
				}

				// Shift macOS menus by a few pixels below elements
				// to account for extra padding on top of native menu
				// https://github.com/microsoft/vscode/issues/84231
				if (isMacintosh) {
					y += 4 / zoom;
				}
			} else if (isAnchor(anchor)) {
				x = anchor.x;
				y = anchor.y;
			} else {
				if (this.useNativeContextMenuLocation) {
					// We leave x/y undefined in this case which will result in
					// Electron taking care of opening the menu at the cursor position.
				} else {
					x = anchor.posx + 1; // prevent first item from being selected automatically under mouse
					y = anchor.posy;
				}
			}

			if (typeof x === 'number') {
				x = Math.floor(x * zoom);
			}

			if (typeof y === 'number') {
				y = Math.floor(y * zoom);
			}

			popup(menu, { x, y, positioningItem: delegate.autoSelectFirstItem ? 0 : undefined, }, () => onHide());

			this._onDidShowContextMenu.fire();
		}
	}

	private createMenu(delegate: IContextMenuDelegate, entries: readonly IAction[], onHide: () => void, submenuIds = new Set<string>()): IContextMenuItem[] {
		const actionRunner = delegate.actionRunner || new ActionRunner();
		return coalesce(entries.map(entry => this.createMenuItem(delegate, entry, actionRunner, onHide, submenuIds)));
	}

	private createMenuItem(delegate: IContextMenuDelegate, entry: IAction, actionRunner: IActionRunner, onHide: () => void, submenuIds: Set<string>): IContextMenuItem | undefined {
		// Separator
		if (entry instanceof Separator) {
			return { type: 'separator' };
		}

		// Submenu
		if (entry instanceof SubmenuAction) {
			if (submenuIds.has(entry.id)) {
				console.warn(`Found submenu cycle: ${entry.id}`);
				return undefined;
			}

			return {
				label: unmnemonicLabel(stripIcons(entry.label)).trim(),
				submenu: this.createMenu(delegate, entry.actions, onHide, new Set([...submenuIds, entry.id]))
			};
		}

		// Normal Menu Item
		else {
			let type: 'radio' | 'checkbox' | undefined = undefined;
			if (!!entry.checked) {
				if (typeof delegate.getCheckedActionsRepresentation === 'function') {
					type = delegate.getCheckedActionsRepresentation(entry);
				} else {
					type = 'checkbox';
				}
			}

			const item: IContextMenuItem = {
				label: unmnemonicLabel(stripIcons(entry.label)).trim(),
				checked: !!entry.checked,
				type,
				enabled: !!entry.enabled,
				click: event => {

					// To preserve pre-electron-2.x behaviour, we first trigger
					// the onHide callback and then the action.
					// Fixes https://github.com/microsoft/vscode/issues/45601
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

	private async runAction(actionRunner: IActionRunner, actionToRun: IAction, delegate: IContextMenuDelegate, event: IContextMenuEvent): Promise<void> {
		if (!delegate.skipTelemetry) {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });
		}

		const context = delegate.getActionsContext ? delegate.getActionsContext(event) : undefined;

		const runnable = actionRunner.run(actionToRun, context);
		try {
			await runnable;
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
