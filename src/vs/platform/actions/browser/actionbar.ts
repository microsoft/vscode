/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionBar, IActionBarOptions } from '../../../base/browser/ui/actionbar/actionbar.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../base/common/actions.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export interface IWorkbenchActionBarOptions extends IActionBarOptions {
	/**
	 * When set the `workbenchActionExecuted` is automatically sent for each invoked action. The `from` property
	 * of the event will be the passed `telemetrySource`-value.
	 */
	telemetrySource?: string;
}

/**
 * A {@link ActionBar action bar} that automatically sends `workbenchActionExecuted` telemetry
 * events for each invoked action, like {@link import('./toolbar.js').WorkbenchToolBar WorkbenchToolBar} does.
 */
export class WorkbenchActionBar extends ActionBar {

	constructor(
		container: HTMLElement,
		options: IWorkbenchActionBarOptions,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, options);

		const telemetrySource = options.telemetrySource;
		if (telemetrySource) {
			this._store.add(this.onDidRun(e => telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
				'workbenchActionExecuted',
				{ id: e.action.id, from: telemetrySource })
			));
		}
	}
}
