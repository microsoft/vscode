/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import actions = require('vs/base/common/actions');
import events = require('vs/base/common/events');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import {IPartService} from 'vs/workbench/services/part/common/partService';
import wbext = require('vs/workbench/common/contributions');
import debug = require('vs/workbench/parts/debug/common/debug');
import {PauseAction, ContinueAction, StepBackAction, StopAction, DisconnectAction, StepOverAction, StepIntoAction, StepOutAction, RestartAction} from 'vs/workbench/parts/debug/browser/debugActions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

import IDebugService = debug.IDebugService;

const $ = builder.$;
const DEBUG_ACTIONS_WIDGET_POSITION_KEY = 'debug.actionswidgetposition';

export class DebugActionsWidget implements wbext.IWorkbenchContribution {
	private static ID = 'debug.actionsWidget';

	private $el: builder.Builder;
	private dragArea: builder.Builder;
	private toDispose: lifecycle.IDisposable[];
	private actionBar: actionbar.ActionBar;
	private actions: actions.IAction[];
	private pauseAction: PauseAction;
	private continueAction: ContinueAction;
	private stepBackAction: StepBackAction;
	private stopAction: StopAction;
	private disconnectAction: DisconnectAction;
	private isVisible: boolean;
	private isBuilt: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IStorageService private storageService: IStorageService
	) {
		this.$el = $().div().addClass('debug-actions-widget');
		this.dragArea = $().div().addClass('drag-area');
		this.$el.append(this.dragArea);

		const actionBarContainter = $().div().addClass('.action-bar-container');
		this.$el.append(actionBarContainter);

		this.toDispose = [];
		this.actionBar = new actionbar.ActionBar(actionBarContainter, {
			orientation: actionbar.ActionsOrientation.HORIZONTAL
		});

		this.toDispose.push(this.actionBar);
		this.registerListeners();

		this.hide();
		this.isBuilt = false;
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			this.onDebugStateChange(state);
		}));
		this.toDispose.push(this.actionBar.actionRunner.addListener2(events.EventType.RUN, (e: any) => {
			// check for error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.messageService.show(severity.Error, e.error);
			}

			// log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
			}
		}));
		$(window).on(dom.EventType.RESIZE, () => this.setXCoordinate(), this.toDispose);

		this.dragArea.on(dom.EventType.MOUSE_UP, (event: MouseEvent) => {
			const mouseClickEvent = new StandardMouseEvent(event);
			if (mouseClickEvent.detail === 2) {
				// double click on debug bar centers it again #8250
				this.setXCoordinate(0.5 * window.innerWidth);
			}
		});

		this.dragArea.on(dom.EventType.MOUSE_DOWN, (event: MouseEvent) => {
			const $window = $(window);
			this.dragArea.addClass('dragged');

			$window.on('mousemove', (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(e);
				// Prevent default to stop editor selecting text #8524
				mouseMoveEvent.preventDefault();
				this.setXCoordinate(mouseMoveEvent.posx);
			}).once('mouseup', (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(e);
				this.storageService.store(DEBUG_ACTIONS_WIDGET_POSITION_KEY, mouseMoveEvent.posx / window.innerWidth, StorageScope.WORKSPACE);
				this.dragArea.removeClass('dragged');
				$window.off('mousemove');
			});
		});
	}

	private setXCoordinate(x?: number): void {
		if (!this.isVisible) {
			return;
		}
		if (!x) {
			x = parseFloat(this.storageService.get(DEBUG_ACTIONS_WIDGET_POSITION_KEY, StorageScope.WORKSPACE, '0.5')) * window.innerWidth;
		}

		const halfWidgetWidth = this.$el.getHTMLElement().clientWidth / 2;
		x = x + halfWidgetWidth - 16; // take into account half the size of the widget
		x = Math.max(148, x); // do not allow the widget to overflow on the left
		x = Math.min(x, window.innerWidth - halfWidgetWidth - 10); // do not allow the widget to overflow on the right
		this.$el.style('left', `${x}px`);
	}

	public getId(): string {
		return DebugActionsWidget.ID;
	}

	private onDebugStateChange(state: debug.State): void {
		if (state === debug.State.Disabled || state === debug.State.Inactive) {
			return this.hide();
		}

		this.actionBar.clear();
		this.actionBar.push(this.getActions(this.instantiationService, this.debugService.state), { icon: true, label: false });
		this.show();
	}

	private show(): void {
		if (this.isVisible) {
			return;
		}
		if (!this.isBuilt) {
			this.isBuilt = true;
			this.$el.build(builder.withElementById(this.partService.getWorkbenchElementId()).getHTMLElement());
		}

		this.isVisible = true;
		this.$el.show();
		this.setXCoordinate();
	}

	private hide(): void {
		this.isVisible = false;
		this.$el.hide();
	}

	private getActions(instantiationService: IInstantiationService, state: debug.State): actions.IAction[] {
		if (!this.actions) {
			this.continueAction = instantiationService.createInstance(ContinueAction, ContinueAction.ID, ContinueAction.LABEL);
			this.pauseAction = instantiationService.createInstance(PauseAction, PauseAction.ID, PauseAction.LABEL);
			this.stopAction = instantiationService.createInstance(StopAction, StopAction.ID, StopAction.LABEL);
			this.disconnectAction = instantiationService.createInstance(DisconnectAction, DisconnectAction.ID, DisconnectAction.LABEL);
			this.actions = [
				this.continueAction,
				instantiationService.createInstance(StepOverAction, StepOverAction.ID, StepOverAction.LABEL),
				instantiationService.createInstance(StepIntoAction, StepIntoAction.ID, StepIntoAction.LABEL),
				instantiationService.createInstance(StepOutAction, StepOutAction.ID, StepOutAction.LABEL),
				instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL),
				this.stopAction
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
			this.toDispose.push(this.pauseAction);
			this.toDispose.push(this.disconnectAction);
		}

		this.actions[0] = state === debug.State.Running ? this.pauseAction : this.continueAction;
		const session = this.debugService.getActiveSession();
		const configuration = this.debugService.getConfigurationManager().configuration;
		this.actions[5] = configuration && configuration.request === 'attach' ? this.disconnectAction : this.stopAction;

		if (session && session.configuration.capabilities.supportsStepBack) {
			if (!this.stepBackAction) {
				this.stepBackAction = instantiationService.createInstance(StepBackAction, StepBackAction.ID, StepBackAction.LABEL);
				this.toDispose.push(this.stepBackAction);
			}

			// Return a copy of this.actions containing stepBackAction
			return [...this.actions.slice(0, 4), this.stepBackAction, ...this.actions.slice(4)];
		} else {
			return this.actions;
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);

		if (this.$el) {
			this.$el.destroy();
			delete this.$el;
		}
	}
}
