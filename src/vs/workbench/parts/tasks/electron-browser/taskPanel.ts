/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { IAction } from 'vs/base/common/actions';
import { Panel, PanelRegistry, PanelDescriptor, Extensions } from 'vs/workbench/browser/panel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { Registry } from 'vs/platform/registry/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowTasksAction } from 'vs/workbench/parts/tasks/electron-browser/taskPanelActions';

const TASK_PANEL_ID = 'workbench.panel.task';


export class TaskPanel extends Panel {

	private _actions: IAction[];

	constructor(

		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@ITaskService private taskService: ITaskService,
		@IInstantiationService private _instantiationService: IInstantiationService

	) {
		super(TASK_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: Builder): TPromise<any> {
		super.create(parent);
		return TPromise.as(void 0);
	}

	public layout(dimension?: Dimension): void {
		if (!dimension) {
			return;
		}
	}

	public getActions(): IAction[] {
		if (!this._actions) {
			this._actions = [
				this._instantiationService.createInstance(ShowTasksAction, ShowTasksAction.ID, ShowTasksAction.LABEL)
			];
			this._actions.forEach(a => {
				this._register(a);
			});
		}
		return this._actions;
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}

	public focus(): void {
	}
}

(<PanelRegistry>Registry.as(Extensions.Panels)).registerPanel(new PanelDescriptor(
	'vs/workbench/parts/tasks/electron-browser/taskPanel',
	'TaskPanel',
	TASK_PANEL_ID,
	nls.localize('tasks', "Tasks"),
	'task',
	50
));
