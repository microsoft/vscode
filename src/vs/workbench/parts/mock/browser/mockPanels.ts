/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import builder = require('vs/base/browser/builder');
import { Panel } from 'vs/workbench/browser/panel';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const $ = dom.emmet;

export class InformationPanel extends Panel {
	static ID = 'workbench.panel.information';

	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IDebugService private debugService: IDebugService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(InformationPanel.ID, telemetryService);
		this.toDispose = [];
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		const container = dom.append(parent.getHTMLElement(), $('.information'));
		container.textContent = 'MEMORY INFORMATION';

		return TPromise.as(null);
	}

	public layout(dimension: builder.Dimension): void {

	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}
