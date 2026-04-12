/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, addDisposableListener, EventType, getActiveElement, getWindow, isAncestor, isHTMLElement } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { Menu } from '../../../base/browser/ui/menu/menu.js';
import { ActionRunner } from '../../../base/common/actions.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { combinedDisposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { defaultMenuStyles } from '../../theme/browser/defaultStyles.js';
export class ContextMenuHandler {
    constructor(contextViewService, telemetryService, notificationService, keybindingService) {
        this.contextViewService = contextViewService;
        this.telemetryService = telemetryService;
        this.notificationService = notificationService;
        this.keybindingService = keybindingService;
        this.focusToReturn = null;
        this.lastContainer = null;
        this.block = null;
        this.blockDisposable = null;
        this.options = { blockMouse: true };
    }
    configure(options) {
        this.options = options;
    }
    showContextMenu(delegate) {
        const actions = delegate.getActions();
        if (!actions.length) {
            return; // Don't render an empty context menu
        }
        this.focusToReturn = getActiveElement();
        let menu;
        const shadowRootElement = isHTMLElement(delegate.domForShadowRoot) ? delegate.domForShadowRoot : undefined;
        this.contextViewService.showContextView({
            getAnchor: () => delegate.getAnchor(),
            canRelayout: false,
            anchorAlignment: delegate.anchorAlignment,
            anchorAxisAlignment: delegate.anchorAxisAlignment,
            layer: delegate.layer,
            render: (container) => {
                this.lastContainer = container;
                const className = delegate.getMenuClassName ? delegate.getMenuClassName() : '';
                if (className) {
                    container.className += ' ' + className;
                }
                // Render invisible div to block mouse interaction in the rest of the UI
                if (this.options.blockMouse) {
                    this.block = container.appendChild($('.context-view-block'));
                    this.block.style.position = 'fixed';
                    this.block.style.cursor = 'initial';
                    this.block.style.left = '0';
                    this.block.style.top = '0';
                    this.block.style.width = '100%';
                    this.block.style.height = '100%';
                    this.block.style.zIndex = '-1';
                    this.blockDisposable?.dispose();
                    this.blockDisposable = addDisposableListener(this.block, EventType.MOUSE_DOWN, e => e.stopPropagation());
                }
                const menuDisposables = new DisposableStore();
                const actionRunner = delegate.actionRunner || menuDisposables.add(new ActionRunner());
                actionRunner.onWillRun(evt => this.onActionRun(evt, !delegate.skipTelemetry), this, menuDisposables);
                actionRunner.onDidRun(this.onDidActionRun, this, menuDisposables);
                menu = new Menu(container, actions, {
                    actionViewItemProvider: delegate.getActionViewItem,
                    context: delegate.getActionsContext ? delegate.getActionsContext() : null,
                    actionRunner,
                    getKeyBinding: delegate.getKeyBinding ? delegate.getKeyBinding : action => this.keybindingService.lookupKeybinding(action.id)
                }, defaultMenuStyles);
                menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
                menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);
                const targetWindow = getWindow(container);
                menuDisposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.contextViewService.hideContextView(true)));
                menuDisposables.add(addDisposableListener(targetWindow, EventType.MOUSE_DOWN, (e) => {
                    if (e.defaultPrevented) {
                        return;
                    }
                    const event = new StandardMouseEvent(targetWindow, e);
                    let element = event.target;
                    // Don't do anything as we are likely creating a context menu
                    if (event.rightButton) {
                        return;
                    }
                    while (element) {
                        if (element === container) {
                            return;
                        }
                        element = element.parentElement;
                    }
                    this.contextViewService.hideContextView(true);
                }));
                return combinedDisposable(menuDisposables, menu);
            },
            focus: () => {
                menu?.focus(!!delegate.autoSelectFirstItem);
            },
            onHide: (didCancel) => {
                delegate.onHide?.(!!didCancel);
                if (this.block) {
                    this.block.remove();
                    this.block = null;
                }
                this.blockDisposable?.dispose();
                this.blockDisposable = null;
                if (!!this.lastContainer && (getActiveElement() === this.lastContainer || isAncestor(getActiveElement(), this.lastContainer))) {
                    this.focusToReturn?.focus();
                }
                this.lastContainer = null;
            }
        }, shadowRootElement, !!shadowRootElement);
    }
    onActionRun(e, logTelemetry) {
        if (logTelemetry) {
            this.telemetryService.publicLog2('workbenchActionExecuted', { id: e.action.id, from: 'contextMenu' });
        }
        this.contextViewService.hideContextView(false);
    }
    onDidActionRun(e) {
        if (e.error && !isCancellationError(e.error)) {
            this.notificationService.error(e.error);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dE1lbnVIYW5kbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0TWVudUhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMzSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBa0YsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFLckcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFPekUsTUFBTSxPQUFPLGtCQUFrQjtJQU85QixZQUNTLGtCQUF1QyxFQUN2QyxnQkFBbUMsRUFDbkMsbUJBQXlDLEVBQ3pDLGlCQUFxQztRQUhyQyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ3ZDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDbkMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUN6QyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBVnRDLGtCQUFhLEdBQXVCLElBQUksQ0FBQztRQUN6QyxrQkFBYSxHQUF1QixJQUFJLENBQUM7UUFDekMsVUFBSyxHQUF1QixJQUFJLENBQUM7UUFDakMsb0JBQWUsR0FBdUIsSUFB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