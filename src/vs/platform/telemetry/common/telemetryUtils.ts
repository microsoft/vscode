/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cloneAndChange, safeStringify } from '../../../base/common/objects.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IProductService } from '../../product/common/productService.js';
import { getRemoteName } from '../../remote/common/remoteHosts.js';
import { verifyMicrosoftInternalDomain } from './commonProperties.js';
import { ICustomEndpointTelemetryService, ITelemetryData, ITelemetryEndpoint, ITelemetryService, TelemetryConfiguration, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from './telemetry.js';

/**
 * A special class used to denoting a telemetry value which should not be clean.
 * This is because that value is "Trusted" not to contain identifiable information such as paths.
 * NOTE: This is used as an API type as well, and should not be changed.
 */
export class TelemetryTrustedValue<T> {
	// This is merely used as an identifier as the instance will be lost during serialization over the exthost
	public readonly isTrustedTelemetryValue = true;
	constructor(public readonly value: T) { }
}

export class NullTelemetryServiceShape implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.NONE;
	readonly sessionId = 'someValue.sessionId';
	readonly machineId = 'someValue.machineId';
	readonly sqmId = 'someValue.sqmId';
	readonly devDeviceId = 'someValue.devDeviceId';
	readonly firstSessionDate = 'someValue.firstSessionDate';
	readonly sendErrorTelemetry = false;
	publicLog() { }
	publicLog2() { }
	publicLogError() { }
	publicLogError2() { }
	setExperimentProperty() { }
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

export const telemetryLogId = 'telemetry';
export const extensionTelemetryLogChannelId = 'extensionTelemetryLog';

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
	// If it's OSS and telemetry isn't disabled via the CLI we will allow it for logging only purposes
	if (!environmentService.isBuilt && !environmentService.disableTelemetry) {
		return true;
	}
	return !(environmentService.disableTelemetry || !productService.enableTelemetry);
}

/**
 * Checks to see if we're in logging only mode to debug telemetry.
 * This is if telemetry is enabled and we're in OSS, but no telemetry key is provided so it's not being sent just logged.
 * @param productService
 * @param environmentService
 * @returns True if telemetry is actually disabled and we're only logging for debug purposes
 */
export function isLoggingOnly(productService: IProductService, environmentService: IEnvironmentService): boolean {
	// If we're testing an extension, log telemetry for debug purposes
	if (environmentService.extensionTestsLocationURI) {
		return true;
	}
	// Logging only mode is only for OSS
	if (environmentService.isBuilt) {
		return false;
	}

	if (environmentService.disableTelemetry) {
		return false;
	}

	if (productService.enableTelemetry && productService.aiConfig?.ariaKey) {
		return false;
	}

	return true;
}

/**
 * Determines how telemetry is handled based on the user's configuration.
 *
 * @param configurationService
 * @returns OFF, ERROR, ON
 */
export function getTelemetryLevel(configurationService: IConfigurationService): TelemetryLevel {
	const newConfig = configurationService.getValue<TelemetryConfiguration>(TELEMETRY_SETTING_ID);
	const crashReporterConfig = configurationService.getValue<boolean | undefined>(TELEMETRY_CRASH_REPORTER_SETTING_ID);
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

const telemetryAllowedAuthorities = new Set(['ssh-remote', 'dev-container', 'attached-container', 'wsl', 'tunnel', 'codespaces', 'amlext']);

export function cleanRemoteAuthority(remoteAuthority?: string): string {
	if (!remoteAuthority) {
		return 'none';
	}
	const remoteName = getRemoteName(remoteAuthority);
	return telemetryAllowedAuthorities.has(remoteName) ? remoteName : 'other';
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

	// Fast check to see if it is a file path to avoid doing unnecessary heavy regex work
	if (!stack || (!stack.includes('/') && !stack.includes('\\'))) {
		return stack;
	}

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

	const userDataRegexes = [
		{ label: 'Google API Key', regex: /AIza[A-Za-z0-9_\\\-]{35}/ },
		{ label: 'Slack Token', regex: /xox[pbar]\-[A-Za-z0-9]/ },
		{ label: 'GitHub Token', regex: /(gh[psuro]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/ },
		{ label: 'Generic Secret', regex: /(key|token|sig|secret|signature|password|passwd|pwd|android:value)[^a-zA-Z0-9]/i },
		{ label: 'CLI Credentials', regex: /((login|psexec|(certutil|psexec)\.exe).{1,50}(\s-u(ser(name)?)?\s+.{3,100})?\s-(admin|user|vm|root)?p(ass(word)?)?\s+["']?[^$\-\/\s]|(^|[\s\r\n\\])net(\.exe)?.{1,5}(user\s+|share\s+\/user:| user -? secrets ? set) \s + [^ $\s \/])/ },
		{ label: 'Email', regex: /@[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+/ } // Regex which matches @*.site
	];

	// Check for common user data in the telemetry events
	for (const secretRegex of userDataRegexes) {
		if (secretRegex.regex.test(property)) {
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

		// If it's a trusted value it means it's okay to skip cleaning so we don't clean it
		if (value instanceof TelemetryTrustedValue || Object.hasOwnProperty.call(value, 'isTrustedTelemetryValue')) {
			return value.value;
		}

		// We only know how to clean strings
		if (typeof value === 'string') {
			let updatedProperty = value.replaceAll('%20', ' ');

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
