/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import dom = require('vs/base/browser/dom');
import { Builder, Dimension } from 'vs/base/browser/builder';
import { IAction } from 'vs/base/common/actions';
import { Panel, PanelRegistry, PanelDescriptor, Extensions } from 'vs/workbench/browser/panel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { Registry } from 'vs/platform/registry/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ConfigureTaskRunnerAction } from 'vs/workbench/parts/tasks/electron-browser/task.contribution';
import { domElement } from 'vs/workbench/parts/tasks/electron-browser/taskButtons';

const TASK_PANEL_ID = 'workbench.panel.task';

export class TaskPanel extends Panel {

	private _actions: IAction[];
	//private toDispose: lifecycle.IDisposable[];
	private taskContainer: HTMLElement;
	private taskButtons: HTMLElement[];

	constructor(

		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@ITaskService private taskService: ITaskService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService,

	) {
		super(TASK_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: Builder): TPromise<any> {
		super.create(parent);
		dom.addClass(parent.getHTMLElement(), 'task-panel');
		let container = dom.append(parent.getHTMLElement(), dom.$('.task-panel-container'));
		this.taskButtons = [];
		this.createTaskButtons(container);
		return TPromise.as(void 0);
	}

	private createTaskButtons(parent: HTMLElement): void {
		// Make big html string, with localized names
		// Use innerHTML to create dom nodes on the builder
		// Use select/on to add event listeners
		let builder = new Builder(parent, false);
		builder = builder.innerHtml(domElement());
		this.taskContainer = dom.append(parent, builder.child().getHTMLElement());
		let builder1 = builder.select('button');
		builder1.item(0).on('click', e => {
			this.commandService.executeCommand('workbench.action.tasks.runTask');
		});
		builder1.item(1).on('click', e => {
			this.commandService.executeCommand('workbench.action.tasks.build');
		});
		builder1.item(2).on('click', e => {
			this.commandService.executeCommand('workbench.action.tasks.test');
		});
		builder1.item(3).on('click', e => {
			this.commandService.executeCommand('workbench.action.tasks.terminate');
		});
		builder1.item(4).on('click', e => {
			this.commandService.executeCommand('workbench.action.tasks.restartTask');
		});
	}

	public layout(dimension?: Dimension): void {
		if (!dimension) {
			return;
		}
	}

	public getActions(): IAction[] {
		if (!this._actions) {
			this._actions = [
				this._instantiationService.createInstance(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT),
			];
			this._actions.forEach(a => {
				this._register(a);
			});
		}
		return this._actions;
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	};

	public focus(): void {
	};
}

(<PanelRegistry>Registry.as(Extensions.Panels)).registerPanel(new PanelDescriptor(
	'vs/workbench/parts/tasks/electron-browser/taskPanel',
	'TaskPanel',
	TASK_PANEL_ID,
	nls.localize('tasks', "Tasks"),
	'task',
	50
));
