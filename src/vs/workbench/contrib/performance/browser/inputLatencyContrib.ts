/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { inputLatency } from 'vs/base/browser/performance';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class InputLatencyContrib extends Disposable implements IWorkbenchContribution {
	private readonly _listener = this._register(new MutableDisposable());
	private readonly _scheduler: RunOnceScheduler;

	constructor(
		@IEditorService private readonly _editorService: IEditorService
	) {
		super();

		// The current sampling strategy is when the active editor changes, start sampling and
		// report the results after 60 seconds. It's done this way as we don't want to sample
		// everything, just somewhat randomly, and using an interval would utilize CPU when the
		// application is inactive.
		this._scheduler = this._register(new RunOnceScheduler(() => {
			const measurements = inputLatency.getAndClearMeasurements();
			console.log('measurements', measurements);
			// Listen for the next editor change
			this._setupListener();
		}, 60000));

		this._setupListener();
	}

	private _setupListener(): void {
		this._listener.value = Event.once(this._editorService.onDidActiveEditorChange)(() => this._scheduler.schedule());
	}
}
