/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TelemetryService_1;
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mixin } from '../../../base/common/objects.js';
import { isWeb } from '../../../base/common/platform.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Extensions } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { Registry } from '../../registry/common/platform.js';
import { TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SECTION_ID, TELEMETRY_SETTING_ID } from './telemetry.js';
import { cleanData, getTelemetryLevel } from './telemetryUtils.js';
let TelemetryService = class TelemetryService {
    static { TelemetryService_1 = this; }
    static { this.IDLE_START_EVENT_NAME = 'UserIdleStart'; }
    static { this.IDLE_STOP_EVENT_NAME = 'UserIdleStop'; }
    static { this.BUFFER_FLUSH_TIMEOUT = 10000; } // 10 seconds
    static { this.MAX_BUFFER_SIZE = 1000; }
    constructor(config, _configurationService, _productService) {
        this._configurationService = _configurationService;
        this._productService = _productService;
        this._experimentProperties = {};
        this._pendingEvents = [];
        this._isExperimentPropertySet = false;
        this._disposables = new DisposableStore();
        this._cleanupPatterns = [];
        this._appenders = config.appenders;
        this._commonProperties = config.commonProperties ?? Object.create(null);
        this.sessionId = this._commonProperties['sessionID'];
        this.machineId = this._commonProperties['common.machineId'];
        this.sqmId = this._commonProperties['common.sqmId'];
        this.devDeviceId = this._commonProperties['common.devDeviceId'];
        this.firstSessionDate = this._commonProperties['common.firstSessionDate'];
        this.msftInternal = this._commonProperties['common.msftInternal'];
        this._piiPaths = config.piiPaths || [];
        this._telemetryLevel = 3 /* TelemetryLevel.USAGE */;
        this._sendErrorTelemetry = !!config.sendErrorTelemetry;
        this._meteredConnectionService = config.meteredConnectionService;
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
            const affectsTelemetryConfig = e.affectsConfiguration(TELEMETRY_SETTING_ID)
                || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
                || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID);
            if (affectsTelemetryConfig) {
                this._updateTelemetryLevel();
            }
        }));
        // Buffer events until experiment properties are set (or timeout expires).
        // This ensures early events include experiment context when available.
        if (config.waitForExperimentProperties) {
            this._flushTimeout = setTimeout(() => this._flushPendingEvents(), TelemetryService_1.BUFFER_FLUSH_TIMEOUT);
        }
        else {
            this._isExperimentPropertySet = true;
        }
    }
    setExperimentProperty(name, value) {
        this._experimentProperties[name] = value;
        // On first call, flush all pending events that were buffered waiting for experiment properties
        if (!this._isExperimentPropertySet) {
            this._flushPendingEvents();
        }
    }
    setCommonProperty(name, value) {
        this._commonProperties[name] = value;
    }
    _flushPendingEvents() {
        if (this._isExperimentPropertySet) {
            return;
        }
        this._isExperimentPropertySet = true;
        if (this._flushTimeout !== undefined) {
            clearTimeout(this._flushTimeout);
            this._flushTimeout = undefined;
        }
        // Send all buffered events now that experiment properties are available
        for (const event of this._pendingEvents) {
            this._doLog(event.eventName, event.eventLevel, event.data);
        }
        this._pendingEvents = [];
    }
    _updateTelemetryLevel() {
        let level = getTelemetryLevel(this._configurationService);
        const collectableTelemetry = this._productService.enabledTelemetryLevels;
        // Also ensure that error telemetry is respecting the product configuration for collectable telemetry
        if (collectableTelemetry) {
            this._sendErrorTelemetry = this.sendErrorTelemetry ? collectableTelemetry.error : false;
            // Make sure the telemetry level from the service is the minimum of the config and product
            const maxCollectableTelemetryLevel = collectableTelemetry.usage ? 3 /* TelemetryLevel.USAGE */ : collectableTelemetry.error ? 2 /* TelemetryLevel.ERROR */ : 0 /* TelemetryLevel.NONE */;
            level = Math.min(level, maxCollectableTelemetryLevel);
        }
        this._telemetryLevel = level;
    }
    get sendErrorTelemetry() {
        return this._sendErrorTelemetry;
    }
    get telemetryLevel() {
        return this._telemetryLevel;
    }
    dispose() {
        // Flush any remaining pending events before disposing
        this._flushPendingEvents();
        this._disposables.dispose();
    }
    _log(eventName, eventLevel, data) {
        // don't send events when the user is optout
        if (this._telemetryLevel < eventLevel) {
            return;
        }
        // Don't send events when the connection is metered
        if (this._meteredConnectionService?.isConnectionMetered) {
            return;
        }
        // Buffer events until experiment properties are set (or timeout expires)
        if (!this._isExperimentPropertySet) {
            if (this._pendingEvents.length < TelemetryService_1.MAX_BUFFER_SIZE) {
                this._pendingEvents.push({ eventName, eventLevel, data });
            }
            return;
        }
        this._doLog(eventName, eventLevel, data);
    }
    _doLog(eventName, eventLevel, data) {
        // add experiment properties
        data = mixin(data, this._experimentProperties);
        // remove all PII from data
        data = cleanData(data, this._cleanupPatterns);
        // add common properties
        data = mixin(data, this._commonProperties);
        // tag error-level events so the backend can identify them generically
        if (eventLevel === 2 /* TelemetryLevel.ERROR */) {
            data = { ...data, 'isError': true };
        }
        // Log to the appenders of sufficient level
        this._appenders.forEach(a => a.log(eventName, data ?? {}));
    }
    publicLog(eventName, data) {
        this._log(eventName, 3 /* TelemetryLevel.USAGE */, data);
    }
    publicLog2(eventName, data) {
        this.publicLog(eventName, data);
    }
    publicLogError(errorEventName, data) {
        if (!this._sendErrorTelemetry) {
            return;
        }
        // Send error event and anonymize paths
        this._log(errorEventName, 2 /* TelemetryLevel.ERROR */, data);
    }
    publicLogError2(eventName, data) {
        this.publicLogError(eventName, data);
    }
};
TelemetryService = TelemetryService_1 = __decorate([
    __param(1, IConfigurationService),
    __param(2, IProductService)
], TelemetryService);
export { TelemetryService };
function getTelemetryLevelSettingDescription() {
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
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
    'id': TELEMETRY_SECTION_ID,
    'order': 1,
    'type': 'object',
    'title': localize('telemetryConfigurationTitle', "Telemetry"),
    'properties': {
        [TELEMETRY_SETTING_ID]: {
            'type': 'string',
            'enum': ["all" /* TelemetryConfiguration.ON */, "error" /* TelemetryConfiguration.ERROR */, "crash" /* TelemetryConfiguration.CRASH */, "off" /* TelemetryConfiguration.OFF */],
            'enumDescriptions': [
                localize('telemetry.telemetryLevel.default', "Sends usage data, errors, and crash reports."),
                localize('telemetry.telemetryLevel.error', "Sends general error telemetry and crash reports."),
                localize('telemetry.telemetryLevel.crash', "Sends OS level crash reports."),
                localize('telemetry.telemetryLevel.off', "Disables all product telemetry.")
            ],
            'markdownDescription': getTelemetryLevelSettingDescription(),
            'default': "all" /* TelemetryConfiguration.ON */,
            'restricted': true,
            'scope': 1 /* ConfigurationScope.APPLICATION */,
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
            'markdownDescription': !product.privacyStatementUrl ?
                localize('telemetry.enableTelemetry', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) :
                localize('telemetry.enableTelemetryMd', "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl),
            'default': true,
            'restricted': true,
            'markdownDeprecationMessage': localize('enableTelemetryDeprecated', "If this setting is false, no telemetry will be sent regardless of the new setting's value. Deprecated in favor of the {0} setting.", `\`#${TELEMETRY_SETTING_ID}#\``),
            'scope': 1 /* ConfigurationScope.APPLICATION */,
            'tags': ['usesOnlineServices', 'telemetry']
        }
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQXNCLFVBQVUsRUFBMEIsTUFBTSxxREFBcUQsQ0FBQztBQUU3SCxPQUFPLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdELE9BQU8sRUFBNkUsbUNBQW1DLEVBQUUsd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsb0JBQW9CLEVBQXFCLE1BQU0sZ0JBQWdCLENBQUM7QUFDek8sT0FBTyxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBc0IsTUFBTSxxQkFBcUIsQ0FBQztBQXdCaEYsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBZ0I7O2FBRVosMEJBQXFCLEdBQUcsZUFBZSxBQUFsQixDQUFtQjthQUN4Qyx5QkFBb0Is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