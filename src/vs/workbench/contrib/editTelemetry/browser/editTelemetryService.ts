/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService, TelemetryLevel, telemetryLevelEnabled } from '../../../../platform/telemetry/common/telemetry.js';
import { EditTrackingFeature } from './editSourceTrackingFeature.js';
import { EDIT_TELEMETRY_SETTING_ID } from './settings.js';
import { VSCodeWorkspace } from './vscodeObservableWorkspace.js';

export class EditTelemetryService extends Disposable {
	private readonly _editSourceTrackingEnabled;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._editSourceTrackingEnabled = observableConfigValue(EDIT_TELEMETRY_SETTING_ID, true, this._configurationService);

		this._register(autorun(r => {
			const enabled = this._editSourceTrackingEnabled.read(r);
			if (!enabled || !telemetryLevelEnabled(this._telemetryService, TelemetryLevel.USAGE)) {
				return;
			}

			const workspace = this._instantiationService.createInstance(VSCodeWorkspace);

			r.store.add(this._instantiationService.createInstance(EditTrackingFeature, workspace));
		}));
	}
}
