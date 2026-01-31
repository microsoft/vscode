/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService, TelemetryLevel, telemetryLevelEnabled } from '../../../../platform/telemetry/common/telemetry.js';
import { AnnotatedDocuments } from './helpers/annotatedDocuments.js';
import { EditTrackingFeature } from './telemetry/editSourceTrackingFeature.js';
import { VSCodeWorkspace } from './helpers/vscodeObservableWorkspace.js';
import { AiStatsFeature } from './editStats/aiStatsFeature.js';
import { AI_STATS_SETTING_ID, EDIT_TELEMETRY_SETTING_ID } from './settingIds.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';

export class EditTelemetryContribution extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService
	) {
		super();

		const workspace = derived(reader => reader.store.add(instantiationService.createInstance(VSCodeWorkspace)));
		const annotatedDocuments = derived(reader => reader.store.add(instantiationService.createInstance(AnnotatedDocuments, workspace.read(reader))));

		const editSourceTrackingEnabled = observableConfigValue(EDIT_TELEMETRY_SETTING_ID, true, configurationService);
		this._register(autorun(r => {
			const enabled = editSourceTrackingEnabled.read(r);
			if (!enabled || !telemetryLevelEnabled(telemetryService, TelemetryLevel.USAGE)) {
				return;
			}
			r.store.add(instantiationService.createInstance(EditTrackingFeature, workspace.read(r), annotatedDocuments.read(r)));
		}));

		const aiStatsEnabled = observableConfigValue(AI_STATS_SETTING_ID, true, configurationService);
		this._register(autorun(r => {
			const enabled = aiStatsEnabled.read(r);
			const aiDisabled = chatEntitlementService.sentimentObs.read(r).hidden;
			if (!enabled || aiDisabled) {
				return;
			}

			r.store.add(instantiationService.createInstance(AiStatsFeature, annotatedDocuments.read(r)));
		}));
	}
}
