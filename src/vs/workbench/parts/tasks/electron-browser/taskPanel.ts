/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import dom = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
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
import { domElement } from 'vs/workbench/parts/tasks/electron-browser/taskButtons';
import { buttonBackground, buttonForeground, textLinkForeground, selectBackground } from 'vs/platform/theme/common/colorRegistry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IOpenerService } from 'vs/platform/opener/common/opener';

const TASK_PANEL_ID = 'workbench.panel.task';

export class TaskPanel extends Panel {

	private _actions: IAction[];
	private taskExperimentPart5 = 'workbench.tasks.feedbackAnswered';

	constructor(

		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@ITaskService private taskService: ITaskService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService,
		@IStorageService private storageService: IStorageService,
		@IOpenerService private openerService: IOpenerService,

	) {
		super(TASK_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: Builder): TPromise<any> {
		super.create(parent);
		dom.addClass(parent.getHTMLElement(), 'task-panel');

		let builder = parent.innerHtml(domElement());
		let buttons = builder.select('.mockup-button');
		let links = builder.select('.linkstyle');
		let taskItems = builder.select('.task-item');
		let yesButton = builder.select('.yes-telemetry');
		let noButton = builder.select('.no-telemetry');
		let githubLink = builder.select('.linkstyle');
		let clickFeedback = builder.select('.header-item');
		let thanks = builder.select('.thanks');

		buttons.style('background-color', this.themeService.getTheme().getColor(buttonBackground).toString());
		buttons.style('color', this.themeService.getTheme().getColor(buttonForeground).toString());
		links.style('color', this.themeService.getTheme().getColor(textLinkForeground).toString());
		taskItems.style('background-color', this.themeService.getTheme().getColor(selectBackground).toString());

		this.themeService.onThemeChange(() => {
			buttons.style('background-color', this.themeService.getTheme().getColor(buttonBackground).toString());
			buttons.style('color', this.themeService.getTheme().getColor(buttonForeground).toString());
			links.style('color', this.themeService.getTheme().getColor(textLinkForeground).toString());
			taskItems.style('background-color', this.themeService.getTheme().getColor(selectBackground).toString());
		});

		yesButton.item(0).on('click', e => {
			if (!this.storageService.get(this.taskExperimentPart5)) {
				this.telemetryService.publicLog('taskPanel.yes');
				this.storageService.store(this.taskExperimentPart5, true, StorageScope.GLOBAL);
			}
			clickFeedback.addClass('hidden');
			thanks.removeClass('hidden');
		});

		noButton.item(0).on('click', e => {
			if (!this.storageService.get(this.taskExperimentPart5)) {
				this.telemetryService.publicLog('taskPanel.no');
				this.storageService.store(this.taskExperimentPart5, true, StorageScope.GLOBAL);
			}
			clickFeedback.addClass('hidden');
			thanks.removeClass('hidden');
		});

		githubLink.item(0).on('click', e => {
			let node = event.target as HTMLAnchorElement;
			if (node.href) {
				this.openerService.open(URI.parse(node.href));
			}
		});

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
				//this._instantiationService.createInstance(ConfigureTaskRunnerAction, ConfigureTaskRunnerAction.ID, ConfigureTaskRunnerAction.TEXT),
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
