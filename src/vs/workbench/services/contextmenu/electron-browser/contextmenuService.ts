/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import * as dom from '../../../../base/browser/dom.js';
import { IContextMenuMenuDelegate, IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getZoomFactor } from '../../../../base/browser/browser.js';
import { unmnemonicLabel } from '../../../../base/common/labels.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextMenuDelegate, IContextMenuEvent } from '../../../../base/browser/contextmenu.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IContextMenuItem } from '../../../../base/parts/contextmenu/common/contextmenu.js';
import { popup } from '../../../../base/parts/contextmenu/electron-browser/contextmenu.js';
import { hasNativeContextMenu, MenuSettings } from '../../../../platform/window/common/window.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextMenuMenuDelegate, ContextMenuService as HTMLContextMenuService } from '../../../../platform/contextview/browser/contextMenuService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { AnchorAlignment, AnchorAxisAlignment, isAnchor } from '../../../../base/browser/ui/contextview/contextview.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';

export class ContextMenuService implements IContextMenuService {

	declare readonly _serviceBrand: undefined;

	private impl: HTMLContextMenuService | NativeContextMenuService;
	private listener?: IDisposable;

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
		function createContextMenuService(native: boolean) {
			return native ?
				new NativeContextMenuService(notificationService, telemetryService, keybindingService, menuService, contextKeyService)
				: new HTMLContextMenuService(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
		}

		// set initial context menu service
		let isNativeContextMenu = hasNativeContextMenu(configurationService);
		this.impl = createContextMenuService(isNativeContextMenu);

		// MacOS does not need a restart when the menu style changes
		// It should update the context menu style on menu style configuration change
		if (isMacintosh) {
			this.listener = configurationService.onDidChangeConfiguration(e => {
				if (!e.affectsConfiguration(MenuSettings.MenuStyle)) {
					return;
				}

				const newIsNativeContextMenu = hasNativeContextMenu(configurationService);
				if (newIsNativeContextMenu === isNativeContextMenu) {
					return;
				}

				this.impl.dispose();
				this.impl = createContextMenuService(newIsNativeContextMenu);
				isNativeContextMenu = newIsNativeContextMenu;
			});
		}
	}

	dispose(): void {
		this.listener?.dispose();
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

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
	}

	showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {

		delegate = ContextMenuMenuDelegate.transform(delegate, this.menuService, this.contextKeyService);

		const actions = delegate.getActions();
		if (actions.length) {
			const onHide = createSingleCallFunction(() => {
				delegate.onHide?.(false);

				dom.ModifierKeyEmitter.getInstance().resetKeyStatus();
				this._onDidHideContextMenu.fire();
			});

			const menu = this.createMenu(delegate, actions, onHide);
			const anchor = delegate.getAnchor();

			let x: number | undefined;
			let y: number | undefined;

			let zoom = getZoomFactor(dom.isHTMLElement(anchor) ? dom.getWindow(anchor) : dom.getActiveWindow());
			if (dom.isHTMLElement(anchor)) {
				const clientRect = anchor.getBoundingClientRect();
				const elementPosition = { left: clientRect.left, top: clientRect.top, width: clientRect.width, height: clientRect.height };

				// Determine if element is clipped by viewport; if so we'll use the bottom-right of the visible portion
				const win = dom.getWindow(anchor);
				const vw = win.innerWidth;
				const vh = win.innerHeight;
				const isClipped = clientRect.left < 0 || clientRect.top < 0 || clientRect.right > vw || clientRect.bottom > vh;

				// When drawing context menus, we adjust the pixel position for native menus using zoom level
				// In areas where zoom is applied to the element or its ancestors, we need to adjust accordingly
				// e.g. The title bar has counter zoom behavior meaning it applies the inverse of zoom level.
				// Window Zoom Level: 1.5, Title Bar Zoom: 1/1.5, Coordinate Multiplier: 1.5 * 1.0 / 1.5 = 1.0
				zoom *= dom.getDomNodeZoomLevel(anchor);

				if (isClipped) {
					// Element is partially out of viewport: always place at bottom-right visible corner
					x = Math.min(Math.max(clientRect.right, 0), vw);
					y = Math.min(Math.max(clientRect.bottom, 0), vh);
				} else {
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
							const window = dom.getWindow(anchor);
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
				// We leave x/y undefined in this case which will result in
				// Electron taking care of opening the menu at the cursor position.
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
		return coalesce(entries.map(entry => this.createMenuItem(delegate, entry, onHide, submenuIds)));
	}

	private createMenuItem(delegate: IContextMenuDelegate, entry: IAction, onHide: () => void, submenuIds: Set<string>): IContextMenuItem | undefined {
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
			if (entry.checked) {
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
					this.runAction(entry, delegate, event);
				}
			};

			const keybinding = delegate.getKeyBinding ? delegate.getKeyBinding(entry) : this.keybindingService.lookupKeybinding(entry.id);
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

	private async runAction(actionToRun: IAction, delegate: IContextMenuDelegate, event: IContextMenuEvent): Promise<void> {
		if (!delegate.skipTelemetry) {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: actionToRun.id, from: 'contextMenu' });
		}

		const context = delegate.getActionsContext ? delegate.getActionsContext(event) : undefined;

		try {
			if (delegate.actionRunner) {
				await delegate.actionRunner.run(actionToRun, context);
			} else if (actionToRun.enabled) {
				await actionToRun.run(context);
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
