/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { cloneAndChange, mixin } from 'vs/base/common/objects';
import { isWeb } from 'vs/base/common/platform';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import product from 'vs/platform/product/common/product';
import { Registry } from 'vs/platform/registry/common/platform';
import { ClassifiedEvent, GDPRClassification, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryData, ITelemetryInfo, ITelemetryService, TelemetryConfiguration, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SECTION_ID, TELEMETRY_SETTING_ID } from 'vs/platform/telemetry/common/telemetry';
import { getTelemetryConfiguration, ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';

export interface ITelemetryServiceConfig {
	appender: ITelemetryAppender;
	sendErrorTelemetry?: boolean;
	commonProperties?: Promise<{ [name: string]: any }>;
	piiPaths?: string[];
}

export class TelemetryService implements ITelemetryService {

	static readonly IDLE_START_EVENT_NAME = 'UserIdleStart';
	static readonly IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	declare readonly _serviceBrand: undefined;

	private _appender: ITelemetryAppender;
	private _commonProperties: Promise<{ [name: string]: any; }>;
	private _experimentProperties: { [name: string]: string } = {};
	private _piiPaths: string[];
	private _userOptIn: boolean;
	private _errorOptIn: boolean;
	private _enabled: boolean;
	public readonly sendErrorTelemetry: boolean;

	private readonly _disposables = new DisposableStore();
	private _cleanupPatterns: RegExp[] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		this._appender = config.appender;
		this._commonProperties = config.commonProperties || Promise.resolve({});
		this._piiPaths = config.piiPaths || [];
		this._userOptIn = true;
		this._errorOptIn = true;
		this._enabled = true;
		this.sendErrorTelemetry = !!config.sendErrorTelemetry;

		// static cleanup pattern for: `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		this._cleanupPatterns = [/file:\/\/\/.*?\/resources\/app\//gi];

		for (let piiPath of this._piiPaths) {
			this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath), 'gi'));
		}


		this._updateUserOptIn();
		this._configurationService.onDidChangeConfiguration(this._updateUserOptIn, this, this._disposables);
		type OptInClassification = {
			optIn: { classification: 'SystemMetaData', purpose: 'BusinessInsight', isMeasurement: true };
		};
		type OptInEvent = {
			optIn: boolean;
		};
		this.publicLog2<OptInEvent, OptInClassification>('optInStatus', { optIn: this._userOptIn });

		this._commonProperties.then(values => {
			const isHashedId = /^[a-f0-9]+$/i.test(values['common.machineId']);

			type MachineIdFallbackClassification = {
				usingFallbackGuid: { classification: 'SystemMetaData', purpose: 'BusinessInsight', isMeasurement: true };
			};
			this.publicLog2<{ usingFallbackGuid: boolean }, MachineIdFallbackClassification>('machineIdFallback', { usingFallbackGuid: !isHashedId });
		});

		// TODO @sbatten @lramos15 bring this code in after one iteration
		// Once the service initializes we update the telemetry value to the new format
		// this._convertOldTelemetrySettingToNew();
		// this._configurationService.onDidChangeConfiguration(e => {
		// 	if (e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)) {
		// 		this._convertOldTelemetrySettingToNew();
		// 	}
		// }, this);
	}

	setExperimentProperty(name: string, value: string): void {
		this._experimentProperties[name] = value;
	}

	setEnabled(value: boolean): void {
		this._enabled = value;
	}

	// TODO: @sbatten @lramos15 bring this code in after one iteration
	// private _convertOldTelemetrySettingToNew(): void {
	// 	const telemetryValue = this._configurationService.getValue(TELEMETRY_OLD_SETTING_ID);
	// 	if (typeof telemetryValue === 'boolean') {
	// 		this._configurationService.updateValue(TELEMETRY_SETTING_ID, telemetryValue ? 'true' : 'false');
	// 	}
	// }

	private _updateUserOptIn(): void {
		const telemetryConfig = getTelemetryConfiguration(this._configurationService);
		this._errorOptIn = telemetryConfig !== TelemetryConfiguration.OFF;
		this._userOptIn = telemetryConfig === TelemetryConfiguration.ON;
	}

	get isOptedIn(): boolean {
		return this._userOptIn && this._enabled;
	}

	async getTelemetryInfo(): Promise<ITelemetryInfo> {
		const values = await this._commonProperties;

		// well known properties
		let sessionId = values['sessionID'];
		let instanceId = values['common.instanceId'];
		let machineId = values['common.machineId'];
		let firstSessionDate = values['common.firstSessionDate'];
		let msftInternal = values['common.msftInternal'];

		return { sessionId, instanceId, machineId, firstSessionDate, msftInternal };
	}

	dispose(): void {
		this._disposables.dispose();
	}

	publicLog(eventName: string, data?: ITelemetryData, anonymizeFilePaths?: boolean): Promise<any> {
		// don't send events when the user is optout
		if (!this.isOptedIn) {
			return Promise.resolve(undefined);
		}

		return this._commonProperties.then(values => {

			// (first) add common properties
			data = mixin(data, values);

			// (next) add experiment properties
			data = mixin(data, this._experimentProperties);

			// (last) remove all PII from data
			data = cloneAndChange(data, value => {
				if (typeof value === 'string') {
					return this._cleanupInfo(value, anonymizeFilePaths);
				}
				return undefined;
			});

			this._appender.log(eventName, data);

		}, err => {
			// unsure what to do now...
			console.error(err);
		});
	}

	publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>, anonymizeFilePaths?: boolean): Promise<any> {
		return this.publicLog(eventName, data as ITelemetryData, anonymizeFilePaths);
	}

	publicLogError(errorEventName: string, data?: ITelemetryData): Promise<any> {
		if (!this.sendErrorTelemetry || !this._errorOptIn) {
			return Promise.resolve(undefined);
		}

		// Send error event and anonymize paths
		return this.publicLog(errorEventName, data, true);
	}

	publicLogError2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>): Promise<any> {
		return this.publicLogError(eventName, data as ITelemetryData);
	}

	private _anonymizeFilePaths(stack: string): string {
		let updatedStack = stack;

		const cleanUpIndexes: [number, number][] = [];
		for (let regexp of this._cleanupPatterns) {
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
			// Anoynimize user file paths that do not need to be retained or cleaned up.
			if (!nodeModulesRegex.test(result[0]) && cleanUpIndexes.every(([x, y]) => result.index < x || result.index >= y)) {
				updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>';
				lastIndex = fileRegex.lastIndex;
			}
		}
		if (lastIndex < stack.length) {
			updatedStack += stack.substr(lastIndex);
		}

		return updatedStack;
	}

	private _removePropertiesWithPossibleUserInfo(property: string): string {
		// If for some reason it is undefined we skip it (this shouldn't be possible);
		if (!property) {
			return property;
		}

		const value = property.toLowerCase();

		// Regex which matches @*.site
		const emailRegex = /@[a-zA-Z0-9-.]+/;
		const secretRegex = /\S*(key|token|sig|password|passwd|pwd)[="':\s]+\S*/;

		// Check for common user data in the telemetry events
		if (secretRegex.test(value)) {
			return '<REDACTED: secret>';
		} else if (emailRegex.test(value)) {
			return '<REDACTED: email>';
		}

		return property;
	}


	private _cleanupInfo(property: string, anonymizeFilePaths?: boolean): string {
		let updatedProperty = property;

		// anonymize file paths
		if (anonymizeFilePaths) {
			updatedProperty = this._anonymizeFilePaths(updatedProperty);
		}

		// sanitize with configured cleanup patterns
		for (let regexp of this._cleanupPatterns) {
			updatedProperty = updatedProperty.replace(regexp, '');
		}

		// remove possible user info
		updatedProperty = this._removePropertiesWithPossibleUserInfo(updatedProperty);

		return updatedProperty;
	}
}

const restartString = !isWeb ? ' ' + localize('telemetry.restart', 'Some features may require a restart to take effect.') : '';
Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 110,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry"),
	'properties': {
		[TELEMETRY_SETTING_ID]: {
			'type': 'string',
			'enum': [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.OFF],
			'enumDescriptions': [
				localize('telemetry.enableTelemetry.default', "Enables all telemetry data to be collected."),
				localize('telemetry.enableTelemetry.error', "Enables only error telemetry data and not general usage data."),
				localize('telemetry.enableTelemetry.off', "Disables all product telemetry.")
			],
			'markdownDescription':
				!product.privacyStatementUrl ?
					localize('telemetry.enableTelemetry', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) + restartString :
					localize('telemetry.enableTelemetryMd', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl) + restartString,
			'default': TelemetryConfiguration.ON,
			'restricted': true,
			'scope': ConfigurationScope.APPLICATION,
			'tags': ['usesOnlineServices', 'telemetry']
		}
	}
});

// Deprecated telemetry setting
Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 110,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry"),
	'properties': {
		[TELEMETRY_OLD_SETTING_ID]: {
			'type': 'boolean',
			'markdownDescription':
				!product.privacyStatementUrl ?
					localize('telemetry.enableTelemetry', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) :
					localize('telemetry.enableTelemetryMd', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl),
			'default': true,
			'restricted': true,
			'markdownDeprecationMessage': localize('enableTelemetryDeprecated', "Deprecated in favor of the {0} setting.", `\`#${TELEMETRY_SETTING_ID}#\``),
			'scope': ConfigurationScope.APPLICATION,
			'tags': ['usesOnlineServices', 'telemetry']
		}
	}
});

