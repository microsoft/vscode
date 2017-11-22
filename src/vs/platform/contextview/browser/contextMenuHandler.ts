/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./contextMenuHandler';
import { $, Builder } from 'vs/base/browser/builder';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IActionRunner, ActionRunner, IAction, IRunEvent } from 'vs/base/common/actions';
import { Menu } from 'vs/base/browser/ui/menu/menu';
import Severity from 'vs/base/common/severity';

import { IContextViewService, IContextMenuDelegate } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';

export class ContextMenuHandler {

	private contextViewService: IContextViewService;
	private messageService: IMessageService;
	private telemetryService: ITelemetryService;

	private actionRunner: IActionRunner;
	private $el: Builder;
	private menuContainerElement: HTMLElement;
	private toDispose: IDisposable[];

	constructor(element: HTMLElement, contextViewService: IContextViewService, telemetryService: ITelemetryService, messageService: IMessageService) {
		this.setContainer(element);

		this.contextViewService = contextViewService;
		this.telemetryService = telemetryService;
		this.messageService = messageService;

		this.actionRunner = new ActionRunner();
		this.menuContainerElement = null;
		this.toDispose = [];

		let hideViewOnRun = false;

		this.toDispose.push(this.actionRunner.onDidBeforeRun((e: IRunEvent) => {
			if (this.telemetryService) {
				/* __GDPR__
					"workbenchActionExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'contextMenu' });
			}

			hideViewOnRun = !!(<any>e).retainActionItem;

			if (!hideViewOnRun) {
				this.contextViewService.hideContextView(false);
			}
		}));

		this.toDispose.push(this.actionRunner.onDidRun((e: IRunEvent) => {
			if (hideViewOnRun) {
				this.contextViewService.hideContextView(false);
			}

			hideViewOnRun = false;

			if (e.error && this.messageService) {
				this.messageService.show(Severity.Error, e.error);
			}
		}));
	}

	public setContainer(container: HTMLElement): void {
		if (this.$el) {
			this.$el.off(['click', 'mousedown']);
			this.$el = null;
		}
		if (container) {
			this.$el = $(container);
			this.$el.on('mousedown', (e: Event) => this.onMouseDown(e as MouseEvent));
		}
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		delegate.getActions().done((actions: IAction[]) => {
			this.contextViewService.showContextView({
				getAnchor: () => delegate.getAnchor(),
				canRelayout: false,

				render: (container) => {
					this.menuContainerElement = container;

					let className = delegate.getMenuClassName ? delegate.getMenuClassName() : '';

					if (className) {
						container.className += ' ' + className;
					}

					let menu = new Menu(container, actions, {
						actionItemProvider: delegate.getActionItem,
						context: delegate.getActionsContext ? delegate.getActionsContext() : null,
						actionRunner: this.actionRunner
					});

					let listener1 = menu.onDidCancel(() => {
						this.contextViewService.hideContextView(true);
					});

					let listener2 = menu.onDidBlur(() => {
						this.contextViewService.hideContextView(true);
					});

					menu.focus();

					return combinedDisposable([listener1, listener2, menu]);
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