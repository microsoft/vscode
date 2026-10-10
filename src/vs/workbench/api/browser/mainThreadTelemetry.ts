/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { isValidAssignmentContext } from '../../../platform/telemetry/common/assignmentContext.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../platform/telemetry/common/gdprTypings.js';
import { ITelemetryService, TelemetryLevel, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID, ITelemetryData } from '../../../platform/telemetry/common/telemetry.js';
import { supportsTelemetry } from '../../../platform/telemetry/common/telemetryUtils.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostTelemetryShape, MainContext, MainThreadTelemetryShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadTelemetry)
export class MainThreadTelemetry extends Disposable implements MainThreadTelemetryShape {
	private readonly _proxy: ExtHostTelemetryShape;

	private static readonly _name = 'pluginHostTelemetry';

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTelemetry);

		if (supportsTelemetry(this._productService, this._environmentService)) {
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)) {
					this._proxy.$onDidChangeTelemetryLevel(this.telemetryLevel);
				}
			}));
		}
		this._proxy.$initializeTelemetryLevel(this.telemetryLevel, supportsTelemetry(this._productService, this._environmentService), this._productService.enabledTelemetryLevels);
	}

	private get telemetryLevel(): TelemetryLevel {
		if (!supportsTelemetry(this._productService, this._environmentService)) {
			return TelemetryLevel.NONE;
		}

		return this._telemetryService.telemetryLevel;
	}

	$publicLog(eventName: string, data: ITelemetryData = Object.create(null)): void {
		// __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		data[MainThreadTelemetry._name] = true;
		this._telemetryService.publicLog(eventName, data);
	}

	$publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.$publicLog(eventName, data);
	}
}

/**
 * The core telemetry property under which the Copilot CAPI flight assignment
 * context is surfaced. It mirrors the scope of `abexp.assignmentcontext`.
 */
export const CAPI_ASSIGNMENT_CONTEXT_PROPERTY = 'capi.assignmentcontext';

/**
 * The private command Copilot invokes to forward its CAPI flight assignments
 * into core telemetry. Not part of the public API.
 */
export const SET_CAPI_ASSIGNMENT_CONTEXT_COMMAND = '_telemetry.setCapiAssignmentContext';

/**
 * Validates a CAPI assignment-context string before it is trusted onto every
 * core telemetry event. Because {@link ITelemetryService.setExperimentProperty}
 * wraps the value in a `TelemetryTrustedValue` (bypassing PII cleaning), the
 * value must be strictly shaped: a non-empty, size-capped list of `key:value`
 * entries separated by `;`, with no whitespace or control characters. Any
 * malformed input is rejected outright.
 */
export function isValidCapiAssignmentContext(value: string): boolean {
	return isValidAssignmentContext(value);
}

CommandsRegistry.registerCommand(SET_CAPI_ASSIGNMENT_CONTEXT_COMMAND, function (accessor, value: string) {
	if (typeof value !== 'string' || !isValidCapiAssignmentContext(value)) {
		return;
	}

	accessor.get(ITelemetryService).setExperimentProperty(CAPI_ASSIGNMENT_CONTEXT_PROPERTY, value);
});
