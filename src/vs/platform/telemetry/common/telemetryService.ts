/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mixin } from '../../../base/common/objects.js';
import { isWeb } from '../../../base/common/platform.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { Registry } from '../../registry/common/platform.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from './gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryConfiguration, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SECTION_ID, TELEMETRY_SETTING_ID, ICommonProperties } from './telemetry.js';
import { cleanData, getTelemetryLevel, ITelemetryAppender } from './telemetryUtils.js';

export interface ITelemetryServiceConfig {
	appenders: ITelemetryAppender[];
	sendErrorTelemetry?: boolean;
	commonProperties?: ICommonProperties;
	piiPaths?: string[];
}

export class TelemetryService implements ITelemetryService {

	static readonly IDLE_START_EVENT_NAME = 'UserIdleStart';
	static readonly IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	declare readonly _serviceBrand: undefined;

	readonly sessionId: string;
	readonly machineId: string;
	readonly sqmId: string;
	readonly devDeviceId: string;
	readonly firstSessionDate: string;
	readonly msftInternal: boolean | undefined;

	private _appenders: ITelemetryAppender[];
	private _commonProperties: ICommonProperties;
	private _experimentProperties: { [name: string]: string } = {};
	private _piiPaths: string[];
	private _telemetryLevel: TelemetryLevel;
	private _sendErrorTelemetry: boolean;

	private readonly _disposables = new DisposableStore();
	private _cleanupPatterns: RegExp[] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IProductService private _productService: IProductService
	) {
		this._appenders = config.appenders;
		this._commonProperties = config.commonProperties ?? Object.create(null);

		this.sessionId = this._commonProperties['sessionID'] as string;
		this.machineId = this._commonProperties['common.machineId'] as string;
		this.sqmId = this._commonProperties['common.sqmId'] as string;
		this.devDeviceId = this._commonProperties['common.devDeviceId'] as string;
		this.firstSessionDate = this._commonProperties['common.firstSessionDate'] as string;
		this.msftInternal = this._commonProperties['common.msftInternal'] as boolean | undefined;

		this._piiPaths = config.piiPaths || [];
		this._telemetryLevel = TelemetryLevel.USAGE;
		this._sendErrorTelemetry = !!config.sendErrorTelemetry;

		// static cleanup pattern for: `vscode-file:///DANGEROUS/PATH/resources/app/Useful/Information`
		this._cleanupPatterns = [/(vscode-)?file:\/\/.*?\/resources\/app\//gi];

		for (const piiPath of this._piiPaths) {
			this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath), 'gi'));

			if (piiPath.indexOf('\\') >= 0) {
				this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath.replace(/\\/g, '/')), 'gi'));
			}
		}

		this._updateTelemetryLevel();
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			// Check on the telemetry settings and update the state if changed
			const affectsTelemetryConfig =
				e.affectsConfiguration(TELEMETRY_SETTING_ID)
				|| e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
				|| e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID);
			if (affectsTelemetryConfig) {
				this._updateTelemetryLevel();
			}
		}));
	}

	setExperimentProperty(name: string, value: string): void {
		this._experimentProperties[name] = value;
	}

	private _updateTelemetryLevel(): void {
		let level = getTelemetryLevel(this._configurationService);
		const collectableTelemetry = this._productService.enabledTelemetryLevels;
		// Also ensure that error telemetry is respecting the product configuration for collectable telemetry
		if (collectableTelemetry) {
			this._sendErrorTelemetry = this.sendErrorTelemetry ? collectableTelemetry.error : false;
			// Make sure the telemetry level from the service is the minimum of the config and product
			const maxCollectableTelemetryLevel = collectableTelemetry.usage ? TelemetryLevel.USAGE : collectableTelemetry.error ? TelemetryLevel.ERROR : TelemetryLevel.NONE;
			level = Math.min(level, maxCollectableTelemetryLevel);
		}

		this._telemetryLevel = level;
	}

	get sendErrorTelemetry(): boolean {
		return this._sendErrorTelemetry;
	}

	get telemetryLevel(): TelemetryLevel {
		return this._telemetryLevel;
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _log(eventName: string, eventLevel: TelemetryLevel, data?: ITelemetryData) {
		// don't send events when the user is optout
		if (this._telemetryLevel < eventLevel) {
			return;
		}

		// add experiment properties
		data = mixin(data, this._experimentProperties);

		// remove all PII from data
		data = cleanData(data, this._cleanupPatterns);

		// add common properties
		data = mixin(data, this._commonProperties);

		// Log to the appenders of sufficient level
		this._appenders.forEach(a => a.log(eventName, data ?? {}));
	}

	publicLog(eventName: string, data?: ITelemetryData) {
		this._log(eventName, TelemetryLevel.USAGE, data);
	}

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLog(eventName, data as ITelemetryData);
	}

	publicLogError(errorEventName: string, data?: ITelemetryData) {
		if (!this._sendErrorTelemetry) {
			return;
		}

		// Send error event and anonymize paths
		this._log(errorEventName, TelemetryLevel.ERROR, data);
	}

	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLogError(eventName, data as ITelemetryData);
	}
}

function getTelemetryLevelSettingDescription(): string {
	const telemetryText = localize('telemetry.telemetryLevelMd', "Controls {0} telemetry, first-party extension telemetry, and participating third-party extension telemetry. Some third party extensions might not respect this setting. Consult the specific extension's documentation to be sure. Telemetry helps us better understand how {0} is performing, where improvements need to be made, and how features are being used.", product.nameLong);
	const externalLinksStatement = !product.privacyStatementUrl ?
		localize("telemetry.docsStatement", "Read more about the [data we collect]({0}).", 'https://aka.ms/vscode-telemetry') :
		localize("telemetry.docsAndPrivacyStatement", "Read more about the [data we collect]({0}) and our [privacy statement]({1}).", 'https://aka.ms/vscode-telemetry', product.privacyStatementUrl);
	const restartString = !isWeb ? localize('telemetry.restart', 'A full restart of the application is necessary for crash reporting changes to take effect.') : '';

	const crashReportsHeader = localize('telemetry.crashReports', "Crash Reports");
	const errorsHeader = localize('telemetry.errors', "Error Telemetry");
	const usageHeader = localize('telemetry.usage', "Usage Data");

	const telemetryTableDescription = localize('telemetry.telemetryLevel.tableDescription', "The following table outlines the data sent with each setting:");
	const telemetryTable = `
|       | ${crashReportsHeader} | ${errorsHeader} | ${usageHeader} |
|:------|:-------------:|:---------------:|:----------:|
| all   |       ✓       |        ✓        |     ✓      |
| error |       ✓       |        ✓        |     -      |
| crash |       ✓       |        -        |     -      |
| off   |       -       |        -        |     -      |
`;

	const deprecatedSettingNote = localize('telemetry.telemetryLevel.deprecated', "****Note:*** If this setting is 'off', no telemetry will be sent regardless of other telemetry settings. If this setting is set to anything except 'off' and telemetry is disabled with deprecated settings, no telemetry will be sent.*");
	const telemetryDescription = `
${telemetryText} ${externalLinksStatement} ${restartString}

&nbsp;

${telemetryTableDescription}
${telemetryTable}

&nbsp;

${deprecatedSettingNote}
`;

	return telemetryDescription;
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 1,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry"),
	'properties': {
		[TELEMETRY_SETTING_ID]: {
			'type': 'string',
			'enum': [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
			'enumDescriptions': [
				localize('telemetry.telemetryLevel.default', "Sends usage data, errors, and crash reports."),
				localize('telemetry.telemetryLevel.error', "Sends general error telemetry and crash reports."),
				localize('telemetry.telemetryLevel.crash', "Sends OS level crash reports."),
				localize('telemetry.telemetryLevel.off', "Disables all product telemetry.")
			],
			'markdownDescription': getTelemetryLevelSettingDescription(),
			'default': TelemetryConfiguration.ON,
			'restricted': true,
			'scope': ConfigurationScope.APPLICATION,
			'tags': ['usesOnlineServices', 'telemetry'],
			'policy': {
				name: 'TelemetryLevel',
				category: PolicyCategory.Telemetry,
				minimumVersion: '1.99',
				localization: {
					description: {
						key: 'telemetry.telemetryLevel.policyDescription',
						value: localize('telemetry.telemetryLevel.policyDescription', "Controls the level of telemetry."),
					},
					enumDescriptions: [
						{
							key: 'telemetry.telemetryLevel.default',
							value: localize('telemetry.telemetryLevel.default', "Sends usage data, errors, and crash reports."),
						},
						{
							key: 'telemetry.telemetryLevel.error',
							value: localize('telemetry.telemetryLevel.error', "Sends general error telemetry and crash reports."),
						},
						{
							key: 'telemetry.telemetryLevel.crash',
							value: localize('telemetry.telemetryLevel.crash', "Sends OS level crash reports."),
						},
						{
							key: 'telemetry.telemetryLevel.off',
							value: localize('telemetry.telemetryLevel.off', "Disables all product telemetry."),
						}
					]
				}
			}
		},
		'telemetry.feedback.enabled': {
			type: 'boolean',
			default: true,
			description: localize('telemetry.feedback.enabled', "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options."),
			policy: {
				name: 'EnableFeedback',
				category: PolicyCategory.Telemetry,
				minimumVersion: '1.99',
				localization: { description: { key: 'telemetry.feedback.enabled', value: localize('telemetry.feedback.enabled', "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options.") } },
			}
		},
		// Deprecated telemetry setting
		[TELEMETRY_OLD_SETTING_ID]: {
			'type': 'boolean',
			'markdownDescription':
				!product.privacyStatementUrl ?
					localize('telemetry.enableTelemetry', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) :
					localize('telemetry.enableTelemetryMd', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl),
			'default': true,
			'restricted': true,
			'markdownDeprecationMessage': localize('enableTelemetryDeprecated', "If this setting is false, no telemetry will be sent regardless of the new setting's value. Deprecated in favor of the {0} setting.", `\`#${TELEMETRY_SETTING_ID}#\``),
			'scope': ConfigurationScope.APPLICATION,
			'tags': ['usesOnlineServices', 'telemetry']
		}
	},
});
