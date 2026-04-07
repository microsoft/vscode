/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { TelemetryTrustedValue } from 'vscode';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { RequestId } from '../../networking/common/fetch';
import { ITelemetryUserConfig, TelemetryEventProperties, TelemetryProperties } from './telemetry';

export class TelemetryData {

	properties: TelemetryProperties;
	measurements: { [key: string]: number | undefined };
	issuedTime: number;
	displayedTime?: number;

	private static keysExemptedFromSanitization: string[] = [
		'VSCode.ABExp.Features',
		'abexp.assignmentcontext',
	];

	private constructor(
		properties: { [key: string]: string },
		measurements: { [key: string]: number | undefined },
		issuedTime: number
	) {
		this.properties = properties;
		this.measurements = measurements;
		this.issuedTime = issuedTime;
	}

	static createAndMarkAsIssued(
		properties?: { [key: string]: string },
		measurements?: { [key: string]: number | undefined }
	): TelemetryData {
		return new TelemetryData(properties || {}, measurements || {}, Date.now());
	}

	/**
	 * @param properties new properties, which will overwrite old ones in case of a clash
	 * @param measurements new measurements, which will overwrite old ones in case of a clash
	 * @returns a TelemetryData object whose contents extend (copies of) the current one's and whose creation date is not updated
	 */
	extendedBy(properties?: TelemetryProperties, measurements?: { [key: string]: number | undefined }): TelemetryData {
		const newProperties = { ...this.properties, ...properties };
		const newMeasurements = { ...this.measurements, ...measurements };
		const newData = new TelemetryData(newProperties, newMeasurements, this.issuedTime);
		newData.displayedTime = this.displayedTime;

		return newData;
	}

	/**
	 * registers current time as the point where this was displayed
	 * (no-op if a display time is already registered)
	 */
	markAsDisplayed(): void {
		if (this.displayedTime === undefined) {
			this.displayedTime = Date.now();
		}
	}

	extendWithEditorAgnosticFields(envService: IEnvService): void {
		this.properties['editor_version'] = envService.getEditorInfo().format();
		this.properties['editor_plugin_version'] = envService.getEditorPluginInfo().format();
		this.properties['client_machineid'] = envService.machineId;
		this.properties['client_sessionid'] = envService.sessionId;
		this.properties['copilot_version'] = `copilot/${envService.getVersion()}`;

		this.properties['common_extname'] = envService.getEditorPluginInfo().name;
		this.properties['common_extversion'] = envService.getEditorPluginInfo().version;
		this.properties['common_vscodeversion'] = envService.getEditorInfo().format();
	}

	/**
	 * Iterate config keys defined in the package.json, lookup current config
	 * value and return as telemetry property. Property name in dotted notation
	 * and value is a json string.
	 * e.g. { 'copilot.autocompletion.count': 3 }
	 */
	extendWithConfigProperties(configService: IConfigurationService, envService: IEnvService, telemetryConfig: ITelemetryUserConfig): void {
		const configProperties: { [key: string]: string } = configService.dumpConfig();
		configProperties['copilot.build'] = envService.getBuild();
		configProperties['copilot.buildType'] = envService.getBuildType();

		if (telemetryConfig.trackingId) {
			configProperties['copilot.trackingId'] = telemetryConfig.trackingId;
		}
		if (telemetryConfig.organizationsList) {
			configProperties['organizations_list'] = telemetryConfig.organizationsList;
		}
		if (telemetryConfig.enterpriseList) {
			configProperties['enterprise_list'] = telemetryConfig.enterpriseList;
		}

		// By being the second argument, configProperties will always override
		this.properties = { ...this.properties, ...configProperties };
	}

	extendWithRequestId(requestId: RequestId): void {
		const requestProperties = {
			completionId: requestId.completionId,
			created: requestId.created.toString(),
			headerRequestId: requestId.headerRequestId,
			serverExperiments: requestId.serverExperiments,
			deploymentId: requestId.deploymentId,
		};
		this.properties = { ...this.properties, ...requestProperties };
	}

	private static keysToRemoveFromStandardTelemetry: string[] = [
		'gitRepoHost',
		'gitRepoName',
		'gitRepoOwner',
		'gitRepoUrl',
		'gitRepoPath',
		'repo',
		'request_option_nwo',
		'userKind',
	];

	/**
	 * Remove the known properties relating to repository information from the telemetry data if necessary
	 */
	static maybeRemoveRepoInfoFromPropertiesHack(secure: boolean, map: { [key: string]: any }): { [key: string]: any } {
		if (secure) {
			// We want to keep including these properties in secure/enhanced telemetry.
			return map;
		}
		// deliberately written in the same style as `sanitizeKeys` to minimise risk
		const returnValue: { [key: string]: any } = {};
		for (const key in map) {
			if (!TelemetryData.keysToRemoveFromStandardTelemetry.includes(key)) {
				returnValue[key] = map[key];
			}
		}
		return returnValue;
	}

	sanitizeKeys(): void {
		this.properties = TelemetryData.sanitizeKeys(this.properties);
		this.measurements = TelemetryData.sanitizeKeys(this.measurements);
	}

	static sanitizeKeys(map?: { [key: string]: any }): { [key: string]: any } {
		// We need all keys to not have dots in them for telemetry to function
		map = map || {};
		const returnValue: { [key: string]: any } = {};
		// Iterate over all keys in the map and replace dots with underscores
		for (const key in map) {
			const newKey = TelemetryData.keysExemptedFromSanitization.includes(key) ? key : key.replace(/\./g, '_');
			returnValue[newKey] = map[key];
		}
		return returnValue;
	}

	updateTimeSinceIssuedAndDisplayed(): void {
		const timeSinceIssued = Date.now() - this.issuedTime;
		if (this.measurements.timeSinceIssuedMs === undefined) {
			this.measurements.timeSinceIssuedMs = timeSinceIssued;
		}

		if (this.measurements.timeSinceDisplayedMs === undefined && this.displayedTime !== undefined) {
			const timeSinceDisplayed = Date.now() - this.displayedTime;
			this.measurements.timeSinceDisplayedMs = timeSinceDisplayed;
		}
	}

	makeReadyForSending(configService: IConfigurationService, envService: IEnvService, telemetryConfig: ITelemetryUserConfig) {
		this.extendWithConfigProperties(configService, envService, telemetryConfig);
		this.extendWithEditorAgnosticFields(envService);
		this.sanitizeKeys();
		this.updateTimeSinceIssuedAndDisplayed();
		// Remove undefined values from the telemetry data
		for (const key in this.properties) {
			if (this.properties[key] === undefined) {
				delete this.properties[key];
			}
		}
		addRequiredProperties(envService, this.properties);
	}
}

export function eventPropertiesToSimpleObject(properties?: TelemetryEventProperties): TelemetryProperties | undefined {
	if (!properties) {
		return;
	}
	const simpleObject: TelemetryProperties = {};
	for (const key in properties) {
		const value = properties[key];
		if (!value) {
			continue;
		}
		if ((value as TelemetryTrustedValue<string>).value) {
			simpleObject[key] = (value as TelemetryTrustedValue<string>).value;
		} else {
			simpleObject[key] = value as string;
		}
	}
	return simpleObject;
}

function addRequiredProperties(envService: IEnvService, properties: { [key: string]: string }) {
	properties['unique_id'] = generateUuid(); // add a unique id to the telemetry event so copilot-foundations can correlate with duplicate events
	properties['common_extname'] = envService.getEditorPluginInfo().name;
	properties['common_extversion'] = envService.getEditorPluginInfo().version;
	properties['common_vscodeversion'] = envService.getEditorInfo().format();
}
