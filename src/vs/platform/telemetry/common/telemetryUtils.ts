/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { cloneAndChange, safeStringify } from 'vs/base/common/objects';
import { staticObservableValue } from 'vs/base/common/observableValue';
import { isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';
import { verifyMicrosoftInternalDomain } from 'vs/platform/telemetry/common/commonProperties';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ICustomEndpointTelemetryService, ITelemetryData, ITelemetryEndpoint, ITelemetryInfo, ITelemetryService, TelemetryConfiguration, TelemetryLevel, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from 'vs/platform/telemetry/common/telemetry';

export class NullTelemetryServiceShape implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly sendErrorTelemetry = false;

	publicLog(eventName: string, data?: ITelemetryData) {
		return Promise.resolve(undefined);
	}
	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		return this.publicLog(eventName, data as ITelemetryData);
	}
	publicLogError(eventName: string, data?: ITelemetryData) {
		return Promise.resolve(undefined);
	}
	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		return this.publicLogError(eventName, data as ITelemetryData);
	}

	setExperimentProperty() { }
	telemetryLevel = staticObservableValue(TelemetryLevel.NONE);
	getTelemetryInfo(): Promise<ITelemetryInfo> {
		return Promise.resolve({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId',
			firstSessionDate: 'someValue.firstSessionDate'
		});
	}
}

export const NullTelemetryService = new NullTelemetryServiceShape();

export class NullEndpointTelemetryService implements ICustomEndpointTelemetryService {
	_serviceBrand: undefined;

	async publicLog(_endpoint: ITelemetryEndpoint, _eventName: string, _data?: ITelemetryData): Promise<void> {
		// noop
	}

	async publicLogError(_endpoint: ITelemetryEndpoint, _errorEventName: string, _data?: ITelemetryData): Promise<void> {
		// noop
	}
}

export interface ITelemetryAppender {
	log(eventName: string, data: any): void;
	flush(): Promise<any>;
}

export const NullAppender: ITelemetryAppender = { log: () => null, flush: () => Promise.resolve(null) };


/* __GDPR__FRAGMENT__
	"URIDescriptor" : {
		"mimeType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"scheme": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"ext": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"path": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	}
*/
export interface URIDescriptor {
	mimeType?: string;
	scheme?: string;
	ext?: string;
	path?: string;
}

export function configurationTelemetry(telemetryService: ITelemetryService, configurationService: IConfigurationService): IDisposable {
	return configurationService.onDidChangeConfiguration(event => {
		if (event.source !== ConfigurationTarget.DEFAULT) {
			type UpdateConfigurationClassification = {
				owner: 'lramos15, sbatten';
				comment: 'Event which fires when user updates telemetry configuration';
				configurationSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What configuration file was updated i.e user or workspace' };
				configurationKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What configuration keys were updated' };
			};
			type UpdateConfigurationEvent = {
				configurationSource: string;
				configurationKeys: string[];
			};
			telemetryService.publicLog2<UpdateConfigurationEvent, UpdateConfigurationClassification>('updateConfiguration', {
				configurationSource: ConfigurationTargetToString(event.source),
				configurationKeys: flattenKeys(event.sourceConfig)
			});
		}
	});
}

/**
 * Determines whether or not we support logging telemetry.
 * This checks if the product is capable of collecting telemetry but not whether or not it can send it
 * For checking the user setting and what telemetry you can send please check `getTelemetryLevel`.
 * This returns true if `--disable-telemetry` wasn't used, the product.json allows for telemetry, and we're not testing an extension
 * If false telemetry is disabled throughout the product
 * @param productService
 * @param environmentService
 * @returns false - telemetry is completely disabled, true - telemetry is logged locally, but may not be sent
 */
export function supportsTelemetry(productService: IProductService, environmentService: IEnvironmentService): boolean {
	return !(environmentService.disableTelemetry || !productService.enableTelemetry || environmentService.extensionTestsLocationURI);
}

/**
 * Determines how telemetry is handled based on the user's configuration.
 *
 * @param configurationService
 * @returns OFF, ERROR, ON
 */
export function getTelemetryLevel(configurationService: IConfigurationService): TelemetryLevel {
	const newConfig = configurationService.getValue<TelemetryConfiguration>(TELEMETRY_SETTING_ID);
	const crashReporterConfig = configurationService.getValue<boolean | undefined>('telemetry.enableCrashReporter');
	const oldConfig = configurationService.getValue<boolean | undefined>(TELEMETRY_OLD_SETTING_ID);

	// If `telemetry.enableCrashReporter` is false or `telemetry.enableTelemetry' is false, disable telemetry
	if (oldConfig === false || crashReporterConfig === false) {
		return TelemetryLevel.NONE;
	}

	// Maps new telemetry setting to a telemetry level
	switch (newConfig ?? TelemetryConfiguration.ON) {
		case TelemetryConfiguration.ON:
			return TelemetryLevel.USAGE;
		case TelemetryConfiguration.ERROR:
			return TelemetryLevel.ERROR;
		case TelemetryConfiguration.CRASH:
			return TelemetryLevel.CRASH;
		case TelemetryConfiguration.OFF:
			return TelemetryLevel.NONE;
	}
}

export interface Properties {
	[key: string]: string;
}

export interface Measurements {
	[key: string]: number;
}

export function validateTelemetryData(data?: any): { properties: Properties; measurements: Measurements } {

	const properties: Properties = {};
	const measurements: Measurements = {};

	const flat: Record<string, any> = {};
	flatten(data, flat);

	for (let prop in flat) {
		// enforce property names less than 150 char, take the last 150 char
		prop = prop.length > 150 ? prop.substr(prop.length - 149) : prop;
		const value = flat[prop];

		if (typeof value === 'number') {
			measurements[prop] = value;

		} else if (typeof value === 'boolean') {
			measurements[prop] = value ? 1 : 0;

		} else if (typeof value === 'string') {
			if (value.length > 8192) {
				console.warn(`Telemetry property: ${prop} has been trimmed to 8192, the original length is ${value.length}`);
			}
			//enforce property value to be less than 8192 char, take the first 8192 char
			// https://docs.microsoft.com/en-us/azure/azure-monitor/app/api-custom-events-metrics#limits
			properties[prop] = value.substring(0, 8191);

		} else if (typeof value !== 'undefined' && value !== null) {
			properties[prop] = value;
		}
	}

	return {
		properties,
		measurements
	};
}

const telemetryAllowedAuthorities: readonly string[] = ['ssh-remote', 'dev-container', 'attached-container', 'wsl', 'tunneling', 'codespaces'];

export function cleanRemoteAuthority(remoteAuthority?: string): string {
	if (!remoteAuthority) {
		return 'none';
	}

	for (const authority of telemetryAllowedAuthorities) {
		if (remoteAuthority.startsWith(`${authority}+`)) {
			return authority;
		}
	}

	return 'other';
}

function flatten(obj: any, result: { [key: string]: any }, order: number = 0, prefix?: string): void {
	if (!obj) {
		return;
	}

	for (const item of Object.getOwnPropertyNames(obj)) {
		const value = obj[item];
		const index = prefix ? prefix + item : item;

		if (Array.isArray(value)) {
			result[index] = safeStringify(value);

		} else if (value instanceof Date) {
			// TODO unsure why this is here and not in _getData
			result[index] = value.toISOString();

		} else if (isObject(value)) {
			if (order < 2) {
				flatten(value, result, order + 1, index + '.');
			} else {
				result[index] = safeStringify(value);
			}
		} else {
			result[index] = value;
		}
	}
}

function flattenKeys(value: Object | undefined): string[] {
	if (!value) {
		return [];
	}
	const result: string[] = [];
	flatKeys(result, '', value);
	return result;
}

function flatKeys(result: string[], prefix: string, value: { [key: string]: any } | undefined): void {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		Object.keys(value)
			.forEach(key => flatKeys(result, prefix ? `${prefix}.${key}` : key, value[key]));
	} else {
		result.push(prefix);
	}
}

/**
 * Whether or not this is an internal user
 * @param productService The product service
 * @param configService The config servivce
 * @returns true if internal, false otherwise
 */
export function isInternalTelemetry(productService: IProductService, configService: IConfigurationService) {
	const msftInternalDomains = productService.msftInternalDomains || [];
	const internalTesting = configService.getValue<boolean>('telemetry.internalTesting');
	return verifyMicrosoftInternalDomain(msftInternalDomains) || internalTesting;
}

interface IPathEnvironment {
	appRoot: string;
	extensionsPath: string;
	userDataPath: string;
	userHome: URI;
	tmpDir: URI;
}

export function getPiiPathsFromEnvironment(paths: IPathEnvironment): string[] {
	return [paths.appRoot, paths.extensionsPath, paths.userHome.fsPath, paths.tmpDir.fsPath, paths.userDataPath];
}

//#region Telemetry Cleaning

/**
 * Cleans a given stack of possible paths
 * @param stack The stack to sanitize
 * @param cleanupPatterns Cleanup patterns to remove from the stack
 * @returns The cleaned stack
 */
function anonymizeFilePaths(stack: string, cleanupPatterns: RegExp[]): string {

	let updatedStack = stack;

	const cleanUpIndexes: [number, number][] = [];
	for (const regexp of cleanupPatterns) {
		while (true) {
			const result = regexp.exec(stack);
			if (!result) {
				break;
			}
			cleanUpIndexes.push([result.index, regexp.lastIndex]);
		}
	}

	const nodeModulesRegex = /^[\\\/]?(node_modules|node_modules\.asar)[\\\/]/;
	const fileRegex = /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]+(\\\\|\\|\/))+[\w-\._]*/g;
	let lastIndex = 0;
	updatedStack = '';

	while (true) {
		const result = fileRegex.exec(stack);
		if (!result) {
			break;
		}

		// Check to see if the any cleanupIndexes partially overlap with this match
		const overlappingRange = cleanUpIndexes.some(([start, end]) => result.index < end && start < fileRegex.lastIndex);

		// anoynimize user file paths that do not need to be retained or cleaned up.
		if (!nodeModulesRegex.test(result[0]) && !overlappingRange) {
			updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>';
			lastIndex = fileRegex.lastIndex;
		}
	}
	if (lastIndex < stack.length) {
		updatedStack += stack.substr(lastIndex);
	}

	return updatedStack;
}

/**
 * Attempts to remove commonly leaked PII
 * @param property The property which will be removed if it contains user data
 * @returns The new value for the property
 */
function removePropertiesWithPossibleUserInfo(property: string): string {
	// If for some reason it is undefined we skip it (this shouldn't be possible);
	if (!property) {
		return property;
	}

	const value = property.toLowerCase();

	const userDataRegexes = [
		{ label: 'Google API Key', regex: /AIza[A-Za-z0-9_\\\-]{35}/ },
		{ label: 'Slack Token', regex: /xox[pbar]\-[A-Za-z0-9]/ },
		{ label: 'Generic Secret', regex: /(key|token|sig|secret|signature|password|passwd|pwd|android:value)[^a-zA-Z0-9]/ },
		{ label: 'Email', regex: /@[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+/ } // Regex which matches @*.site
	];

	// Check for common user data in the telemetry events
	for (const secretRegex of userDataRegexes) {
		if (secretRegex.regex.test(value)) {
			return `<REDACTED: ${secretRegex.label}>`;
		}
	}

	return property;
}


/**
 * Does a best possible effort to clean a data object from any possible PII.
 * @param data The data object to clean
 * @param paths Any additional patterns that should be removed from the data set
 * @returns A new object with the PII removed
 */
export function cleanData(data: Record<string, any>, cleanUpPatterns: RegExp[]): Record<string, any> {
	return cloneAndChange(data, value => {
		// We only know how to clean strings
		if (typeof value === 'string') {
			let updatedProperty = value;
			// First we anonymize any possible file paths
			updatedProperty = anonymizeFilePaths(updatedProperty, cleanUpPatterns);

			// Then we do a simple regex replace with the defined patterns
			for (const regexp of cleanUpPatterns) {
				updatedProperty = updatedProperty.replace(regexp, '');
			}

			// Lastly, remove commonly leaked PII
			updatedProperty = removePropertiesWithPossibleUserInfo(updatedProperty);

			return updatedProperty;
		}
		return undefined;
	});
}

//#endregion
