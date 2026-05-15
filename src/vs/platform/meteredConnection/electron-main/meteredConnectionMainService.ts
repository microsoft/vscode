/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AbstractMeteredConnectionService } from '../common/meteredConnection.js';

/**
 * Electron-main implementation of the metered connection service.
 * This implementation receives metered connection updates via IPC channel from the renderer process.
 */
export class MeteredConnectionMainService extends AbstractMeteredConnectionService {
	private telemetryService: ITelemetryService | undefined;

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super(configurationService, false);
	}

	public setTelemetryService(telemetryService: ITelemetryService): void {
		this.telemetryService = telemetryService;
	}

	protected override onChangeBrowserConnection() {
		// Fire event after sending telemetry if switching to metered since telemetry will be paused.
		const fireAfter = this.isBrowserConnectionMetered;
		if (!fireAfter) {
			super.onChangeBrowserConnection();
		}

		type MeteredConnectionStateChangeEvent = {
			connectionState: boolean;
		};
		type MeteredConnectionStateChangeClassification = {
			owner: 'dmitrivMS';
			comment: 'Tracks metered network connection state changes to understand usage patterns.';
			connectionState: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the underlying network connection is metered according to the OS.' };
		};
		this.telemetryService?.publicLog2<MeteredConnectionStateChangeEvent, MeteredConnectionStateChangeClassification>('meteredConnectionStateChange', {
			connectionState: this.isBrowserConnectionMetered,
		});

		if (fireAfter) {
			super.onChangeBrowserConnection();
		}
	}
}
