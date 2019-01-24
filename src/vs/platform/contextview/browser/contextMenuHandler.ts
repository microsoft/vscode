/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./contextMenuHandler';

import { combinedDisposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionRunner, IRunEvent } from 'vs/base/common/actions';
import { Menu } from 'vs/base/browser/ui/menu/menu';

import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { attachMenuStyler } from 'vs/platform/theme/common/styler';
import { domEvent } from 'vs/base/browser/event';

export class ContextMenuHandler {
	private element: HTMLElement | null;
	private elementDisposable: IDisposable;
	private menuContainerElement: HTMLElement | null;
	private focusToReturn: HTMLElement;

	constructor(
		element: HTMLElement,
		private contextViewService: IContextViewService,
		private telemetryService: ITelemetryService,
		private notificationService: INotificationService,
		private keybindingService: IKeybindingService,
		private themeService: IThemeService
	) {
		this.setContainer(element);
	}

	setContainer(container: HTMLElement | null): void {
		if (this.element) {
			this.elementDisposable = dispose(this.elementDisposable);
			this.element = null;
		}

		if (container) {
			this.element = container;
			this.elementDisposable = addDisposableListener(this.element, EventType.MOUSE_DOWN, (e) => this.onMouseDown(e as MouseEvent));
		}
	}

	showContextMenu(delegate: IContextMenuDelegate): void {
		const actions = delegate.getActions();
		if (!actions.length) {
			return; // Don't render an empty context menu
		}

		this.focusToReturn = document.activeElement as HTMLElement;

		let menu: Menu | undefined;

		this.contextViewService.showContextView({
			getAnchor: () => delegate.getAnchor(),
			canRelayout: false,
			anchorAlignment: delegate.anchorAlignment,

			render: (container) => {
				this.menuContainerElement = container;

				let className = delegate.getMenuClassName ? delegate.getMenuClassName() : '';

				if (className) {
					container.className += ' ' + className;
				}

				const menuDisposables: IDisposable[] = [];

				const actionRunner = delegate.actionRunner || new ActionRunner();
				actionRunner.onDidBeforeRun(this.onActionRun, this, menuDisposables);
				actionRunner.onDidRun(this.onDidActionRun, this, menuDisposables);

				menu = new Menu(container, actions, {
					actionItemProvider: delegate.getActionItem,
					context: delegate.getActionsContext ? delegate.getActionsContext() : null,
					actionRunner,
					getKeyBinding: delegate.getKeyBinding ? delegate.getKeyBinding : action => this.keybindingService.lookupKeybinding(action.id)
				});

				menuDisposables.push(attachMenuStyler(menu, this.themeService));

				menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
				menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);
				domEvent(window, EventType.BLUR)(() => { this.contextViewService.hideContextView(true); }, null, menuDisposables);

				return combinedDisposable([...menuDisposables, menu]);
			},

			focus: () => {
				if (menu) {
					menu.focus(!!delegate.autoSelectFirstItem);
				}
			},

			onHide: (didCancel?: boolean) => {
				if (delegate.onHide) {
					delegate.onHide(!!didCancel);
				}

				if (this.focusToReturn) {
					this.focusToReturn.focus();
				}

				this.menuContainerElement = null;
			}
		});
	}

	private onActionRun(e: IRunEvent): void {
		if (this.telemetryService) {
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'contextMenu' });
		}

		this.contextViewService.hideContextView(false);

		// Restore focus here
		if (this.focusToReturn) {
			this.focusToReturn.focus();
		}
	}

	private onDidActionRun(e: IRunEvent): void {
		if (e.error && this.notificationService) {
			this.notificationService.error(e.error);
		}
	}

	private onMouseDown(e: MouseEvent): void {
		if (!this.menuContainerElement) {
			return;
		}

		let event = new StandardMouseEvent(e);
		let element: HTMLElement | null = event.target;

		while (element) {
			if (element === this.menuContainerElement) {
				return;
			}

			element = element.parentElement;
		}

		this.contextViewService.hideContextView();
	}

	dispose(): void {
		this.setContainer(null);
	}
}
