/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { $, addDisposableListener, EventType, getActiveElement, getWindow, isAncestor, isHTMLElement } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Menu } from 'vs/base/browser/ui/menu/menu';
import { ActionRunner, IRunEvent, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { isCancellationError } from 'vs/base/common/errors';
import { combinedDisposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { defaultMenuStyles } from 'vs/platform/theme/browser/defaultStyles';


export interface IContextMenuHandlerOptions {
	blockMouse: boolean;
}

export class ContextMenuHandler {
	private focusToReturn: HTMLElement | null = null;
	private lastContainer: HTMLElement | null = null;
	private block: HTMLElement | null = null;
	private blockDisposable: IDisposable | null = null;
	private options: IContextMenuHandlerOptions = { blockMouse: true };

	constructor(
		private contextViewService: IContextViewService,
		private telemetryService: ITelemetryService,
		private notificationService: INotificationService,
		private keybindingService: IKeybindingService,
	) { }

	configure(options: IContextMenuHandlerOptions): void {
		this.options = options;
	}

	showContextMenu(delegate: IContextMenuDelegate): void {
		const actions = delegate.getActions();
		if (!actions.length) {
			return; // Don't render an empty context menu
		}

		this.focusToReturn = getActiveElement() as HTMLElement;

		let menu: Menu | undefined;

		const shadowRootElement = isHTMLElement(delegate.domForShadowRoot) ? delegate.domForShadowRoot : undefined;
		this.contextViewService.showContextView({
			getAnchor: () => delegate.getAnchor(),
			canRelayout: false,
			anchorAlignment: delegate.anchorAlignment,
			anchorAxisAlignment: delegate.anchorAxisAlignment,

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

				const actionRunner = delegate.actionRunner || new ActionRunner();
				actionRunner.onWillRun(evt => this.onActionRun(evt, !delegate.skipTelemetry), this, menuDisposables);
				actionRunner.onDidRun(this.onDidActionRun, this, menuDisposables);
				menu = new Menu(container, actions, {
					actionViewItemProvider: delegate.getActionViewItem,
					context: delegate.getActionsContext ? delegate.getActionsContext() : null,
					actionRunner,
					getKeyBinding: delegate.getKeyBinding ? delegate.getKeyBinding : action => this.keybindingService.lookupKeybinding(action.id)
				},
					defaultMenuStyles
				);

				menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
				menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);
				const targetWindow = getWindow(container);
				menuDisposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.contextViewService.hideContextView(true)));
				menuDisposables.add(addDisposableListener(targetWindow, EventType.MOUSE_DOWN, (e: MouseEvent) => {
					if (e.defaultPrevented) {
						return;
					}

					const event = new StandardMouseEvent(targetWindow, e);
					let element: HTMLElement | null = event.target;

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

			onHide: (didCancel?: boolean) => {
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

	private onActionRun(e: IRunEvent, logTelemetry: boolean): void {
		if (logTelemetry) {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: 'contextMenu' });
		}

		this.contextViewService.hideContextView(false);
	}

	private onDidActionRun(e: IRunEvent): void {
		if (e.error && !isCancellationError(e.error)) {
			this.notificationService.error(e.error);
		}
	}
}
