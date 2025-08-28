/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extHostProtocol from './extHost.erdos.protocol.js';
import { Emitter } from '../../../../base/common/event.js';
import { PlotRenderSettings } from '../../../services/erdosPlots/common/erdosPlots.js';

export class ExtHostPlotsService implements extHostProtocol.ExtHostPlotsServiceShape {
	private readonly _proxy: extHostProtocol.MainThreadPlotsServiceShape;
	private readonly _onDidChangePlotsRenderSettings = new Emitter<PlotRenderSettings>();

	constructor(
		mainContext: extHostProtocol.IMainErdosContext,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadPlotsService);
	}

	onDidChangePlotsRenderSettings = this._onDidChangePlotsRenderSettings.event;

	getPlotsRenderSettings(): Promise<PlotRenderSettings> {
		return this._proxy.$getPlotsRenderSettings();
	}

	$onDidChangePlotsRenderSettings(settings: PlotRenderSettings): void {
		this._onDidChangePlotsRenderSettings.fire(settings);
	}
}