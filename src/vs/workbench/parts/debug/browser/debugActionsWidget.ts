/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import builder = require('vs/base/browser/builder');
import actions = require('vs/base/common/actions');
import events = require('vs/base/common/events');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import constants = require('vs/workbench/common/constants');
import wbext = require('vs/workbench/common/contributions');
import debug = require('vs/workbench/parts/debug/common/debug');
import dbgactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import IDebugService = debug.IDebugService;

const $ = builder.$;

export class DebugActionsWidget implements wbext.IWorkbenchContribution {
	private static ID = 'debug.actionsWidget';

	private $el: builder.Builder;
	private toDispose: lifecycle.IDisposable[];
	private actionBar: actionbar.ActionBar;
	private actions: actions.IAction[];
	private pauseAction: dbgactions.PauseAction;
	private continueAction: dbgactions.ContinueAction;
	private isVisible: boolean;
	private isBuilt: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.$el = $().div().addClass('debug-actions-widget');

		this.toDispose = [];
		this.actionBar = new actionbar.ActionBar(this.$el, {
			orientation: actionbar.ActionsOrientation.HORIZONTAL
		});

		this.toDispose.push(this.actionBar);
		this.registerListeners();

		this.hide();
		this.isBuilt = false;
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			this.onDebugStateChange();
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
	}

	public getId(): string {
		return DebugActionsWidget.ID;
	}

	private onDebugStateChange(): void {
		if (this.debugService.getState() === debug.State.Inactive) {
			return this.hide();
		}

		this.actionBar.clear();
		this.actionBar.push(this.getActions(this.instantiationService, this.debugService.getState()), { icon: true, label: false });
		this.show();
	}

	private show(): void {
		if (this.isVisible) {
			return;
		}
		if (!this.isBuilt) {
			this.isBuilt = true;
			this.$el.build(builder.withElementById(constants.Identifiers.WORKBENCH_CONTAINER).getHTMLElement());
		}

		this.isVisible = true;
		this.$el.show();
	}

	private hide(): void {
		this.isVisible = false;
		this.$el.hide();
	}

	private getActions(instantiationService: IInstantiationService, state: debug.State): actions.IAction[] {
		if (!this.actions) {
			this.continueAction = instantiationService.createInstance(dbgactions.ContinueAction, dbgactions.ContinueAction.ID, dbgactions.ContinueAction.LABEL);
			this.pauseAction = instantiationService.createInstance(dbgactions.PauseAction, dbgactions.PauseAction.ID, dbgactions.PauseAction.LABEL);
			this.actions = [
				this.continueAction,
				instantiationService.createInstance(dbgactions.StepOverDebugAction, dbgactions.StepOverDebugAction.ID, dbgactions.StepOverDebugAction.LABEL),
				instantiationService.createInstance(dbgactions.StepIntoDebugAction, dbgactions.StepIntoDebugAction.ID, dbgactions.StepIntoDebugAction.LABEL),
				instantiationService.createInstance(dbgactions.StepOutDebugAction, dbgactions.StepOutDebugAction.ID, dbgactions.StepOutDebugAction.LABEL),
				instantiationService.createInstance(dbgactions.RestartDebugAction, dbgactions.RestartDebugAction.ID, dbgactions.RestartDebugAction.LABEL),
				instantiationService.createInstance(dbgactions.StopDebugAction, dbgactions.StopDebugAction.ID, dbgactions.StopDebugAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
			this.toDispose.push(this.pauseAction);
		}
		this.actions[0] = state === debug.State.Running ? this.pauseAction : this.continueAction;

		return this.actions;
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		if (this.$el) {
			this.$el.destroy();
			delete this.$el;
		}
	}
}
