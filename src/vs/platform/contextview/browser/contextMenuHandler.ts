/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./contextMenuHandler';
import Builder = require('vs/base/browser/builder');
import Lifecycle = require('vs/base/common/lifecycle');
import Mouse = require('vs/base/browser/mouseEvent');
import Actions = require('vs/base/common/actions');
import Menu = require('vs/base/browser/ui/menu/menu');
import Events = require('vs/base/common/events');
import Severity from 'vs/base/common/severity';

import {IContextViewService, IContextMenuDelegate} from './contextView';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IMessageService} from 'vs/platform/message/common/message';

const $ = Builder.$;

export class ContextMenuHandler {

	private contextViewService: IContextViewService;
	private messageService: IMessageService;
	private telemetryService: ITelemetryService;

	private actionRunner: Actions.IActionRunner;
	private $el: Builder.Builder;
	private menuContainerElement: HTMLElement;
	private toDispose: Lifecycle.IDisposable[];

	constructor(element: HTMLElement, contextViewService: IContextViewService, telemetryService: ITelemetryService, messageService: IMessageService) {
		this.setContainer(element);

		this.contextViewService = contextViewService;
		this.telemetryService = telemetryService;
		this.messageService = messageService;

		this.actionRunner = new Actions.ActionRunner();
		this.menuContainerElement = null;
		this.toDispose = [];

		let hideViewOnRun = false;

		this.toDispose.push(this.actionRunner.addListener2(Events.EventType.BEFORE_RUN, (e: any) => {
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, From: 'contextMenu' });
			}

			hideViewOnRun = !!e.retainActionItem;

			if (!hideViewOnRun) {
				this.contextViewService.hideContextView(false);
			}
		}));

		this.toDispose.push(this.actionRunner.addListener2(Events.EventType.RUN, (e: any) => {
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
			this.$el.on('mousedown', (e: MouseEvent) => this.onMouseDown(e));
		}
	}

	public showContextMenu(delegate: IContextMenuDelegate): void {
		delegate.getActions().done((actions: Actions.IAction[]) => {
			this.contextViewService.showContextView({
				getAnchor: () => delegate.getAnchor(),
				canRelayout: false,

				render: (container) => {
					this.menuContainerElement = container;

					let className = delegate.getMenuClassName ? delegate.getMenuClassName() : '';

					if (className) {
						container.className += ' ' + className;
					}

					let menu = new Menu.Menu(container, actions, {
						actionItemProvider: delegate.getActionItem,
						context: delegate.getActionsContext ? delegate.getActionsContext() : null,
						actionRunner: this.actionRunner
					});

					let listener1 = menu.addListener2(Events.EventType.CANCEL, (e: any) => {
						this.contextViewService.hideContextView(true);
					});

					let listener2 = menu.addListener2(Events.EventType.BLUR, (e: any) => {
						this.contextViewService.hideContextView(true);
					});

					menu.focus();

					return Lifecycle.combinedDispose(listener1, listener2, menu);
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

		let event = new Mouse.StandardMouseEvent(e);
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