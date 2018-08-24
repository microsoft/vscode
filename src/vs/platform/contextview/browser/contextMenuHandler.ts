/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./contextMenuHandler';
import { combinedDisposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionRunner, IAction, IRunEvent } from 'vs/base/common/actions';
import { Menu } from 'vs/base/browser/ui/menu/menu';

import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';
import { addDisposableListener } from 'vs/base/browser/dom';

export class ContextMenuHandler {

	private contextViewService: IContextViewService;
	private notificationService: INotificationService;
	private telemetryService: ITelemetryService;

	private $el: HTMLElement;
	private $elDisposable: IDisposable;
	private menuContainerElement: HTMLElement;
	private focusToReturn: HTMLElement;

	constructor(element: HTMLElement, contextViewService: IContextViewService, telemetryService: ITelemetryService, notificationService: INotificationService) {
		this.setContainer(element);

		this.contextViewService = contextViewService;
		this.telemetryService = telemetryService;
		this.notificationService = notificationService;

		this.menuContainerElement = null;
	}

	public setContainer(container: HTMLElement): void {
		if (this.$el) {
			this.$elDisposable = dispose(this.$elDisposable);
			this.$el = null;
		}
		if (container) {
			this.$el = container;
			this.$elDisposable = addDisposableListener(this.$el, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));
		}
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		delegate.getActions().done((actions: IAction[]) => {
			if (!actions.length) {
				return; // Don't render an empty context menu
			}

			this.focusToReturn = document.activeElement as HTMLElement;

			this.contextViewService.showContextView({
				getAnchor: () => delegate.getAnchor(),
				canRelayout: false,

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

					const menu = new Menu(container, actions, {
						actionItemProvider: delegate.getActionItem,
						context: delegate.getActionsContext ? delegate.getActionsContext() : null,
						actionRunner,
						getKeyBinding: delegate.getKeyBinding
					});

					menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
					menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);

					menu.focus(!!delegate.autoSelectFirstItem);

					return combinedDisposable([...menuDisposables, menu]);
				},

				onHide: (didCancel?: boolean) => {
					if (delegate.onHide) {
						delegate.onHide(didCancel);
					}

					this.menuContainerElement = null;
				}
			});
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
		let element = event.target;

		while (element) {
			if (element === this.menuContainerElement) {
				return;
			}

			element = element.parentElement;
		}

		this.contextViewService.hideContextView();
	}

	public dispose(): void {
		this.setContainer(null);
	}
}