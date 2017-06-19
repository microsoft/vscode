/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Panel, PanelRegistry, PanelDescriptor, Extensions } from 'vs/workbench/browser/panel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';

const TASK_PANEL_ID = 'workbench.panel.task';


export class TaskPanel extends Panel {

	constructor(

		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@ITaskService private taskService: ITaskService

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

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}
}

(<PanelRegistry>Registry.as(Extensions.Panels)).registerPanel(new PanelDescriptor(
	'vs/workbench/parts/tasks/electron-browser/taskPanel.ts',
	'TaskPanel',
	TASK_PANEL_ID,
	nls.localize('task', "Task"),
	'task',
	41,
	'testing'
));
