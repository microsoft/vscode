/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule } from '../../../amdX.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { mixin } from '../../../base/common/objects.js';
import { isWeb } from '../../../base/common/platform.js';
import { validateTelemetryData } from './telemetryUtils.js';
const endpointUrl = 'https://mobile.events.data.microsoft.com/OneCollector/1.0';
const endpointHealthUrl = 'https://mobile.events.data.microsoft.com/ping';
async function getClient(instrumentationKey, addInternalFlag, xhrOverride) {
    // eslint-disable-next-line local/code-amd-node-module
    const oneDs = isWeb ? await importAMDNodeModule('@microsoft/1ds-core-js', 'bundle/ms.core.min.js') : await import('@microsoft/1ds-core-js');
    // eslint-disable-next-line local/code-amd-node-module
    const postPlugin = isWeb ? await importAMDNodeModule('@microsoft/1ds-post-js', 'bundle/ms.post.min.js') : await import('@microsoft/1ds-post-js');
    const appInsightsCore = new oneDs.AppInsightsCore();
    const collectorChannelPlugin = new postPlugin.PostChannel();
    // Configure the app insights core to send to collector++ and disable logging of debug info
    const coreConfig = {
        instrumentationKey,
        endpointUrl,
        loggingLevelTelemetry: 0,
        loggingLevelConsole: 0,
        disableCookiesUsage: true,
        disableDbgExt: true,
        disableInstrumentationKeyValidation: true,
        channels: [[
                collectorChannelPlugin
            ]]
    };
    if (xhrOverride) {
        coreConfig.extensionConfig = {};
        // Configure the channel to use a XHR Request override since it's not available in node
        const channelConfig = {
            alwaysUseXhrOverride: true,
            ignoreMc1Ms0CookieProcessing: true,
            httpXHROverride: xhrOverride
        };
        coreConfig.extensionConfig[collectorChannelPlugin.identifier] = channelConfig;
    }
    appInsightsCore.initialize(coreConfig, []);
    appInsightsCore.addTelemetryInitializer((envelope) => {
        // Opt the user out of 1DS data sharing
        envelope['ext'] = envelope['ext'] ?? {};
        envelope['ext']['web'] = envelope['ext']['web'] ?? {};
        envelope['ext']['web']['consentDetails'] = '{"GPC_DataSharingOptIn":false}';
        if (addInternalFlag) {
            envelope['ext']['utc'] = envelope['ext']['utc'] ?? {};
            // Sets it to be internal only based on Windows UTC flagging
            envelope['ext']['utc']['flags'] = 0x0000811ECD;
        }
    });
    return appInsightsCore;
}
// TODO @lramos15 maybe make more in line with src/vs/platform/telemetry/browser/appInsightsAppender.ts with caching support
export class AbstractOneDataSystemAppender {
    constructor(_isInternalTelemetry, _eventPrefix, _defaultData, iKeyOrClientFactory, // allow factory function for testing
    _xhrOverride) {
        this._isInternalTelemetry = _isInternalTelemetry;
        this._eventPrefix = _eventPrefix;
        this._defaultData = _defaultData;
        this._xhrOverride = _xhrOverride;
        this.endPointUrl = endpointUrl;
        this.endPointHealthUrl = endpointHealthUrl;
        if (!this._defaultData) {
            this._defaultData = {};
        }
        if (typeof iKeyOrClientFactory === 'function') {
            this._aiCoreOrKey = iKeyOrClientFactory();
        }
        else {
            this._aiCoreOrKey = iKeyOrClientFactory;
        }
        this._asyncAiCore = null;
    }
    _withAIClient(callback) {
        if (!this._aiCoreOrKey) {
            return;
        }
        if (typeof this._aiCoreOrKey !== 'string') {
            callback(this._aiCoreOrKey);
            return;
        }
        if (!this._asyncAiCore) {
            this._asyncAiCore = getClient(this._aiCoreOrKey, this._isInternalTelemetry, this._xhrOverride);
        }
        this._asyncAiCore.then((aiClient) => {
            callback(aiClient);
        }, (err) => {
            onUnexpectedError(err);
            console.error(err);
        });
    }
    log(eventName, data) {
        if (!this._aiCoreOrKey) {
            return;
        }
        data = mixin(data, this._defaultData);
        const validatedData = validateTelemetryData(data);
        const name = this._eventPrefix + '/' + eventName;
        try {
            this._withAIClient((aiClient) => {
                aiClient.pluginVersionString = validatedData?.properties.version ?? 'Unknown';
                aiClient.track({
                    name,
                    baseData: { name, properties: validatedData?.properties, measurements: validatedData?.measurements }
                });
            });
        }
        catch { }
    }
    flush() {
        if (this._aiCoreOrKey) {
            return new Promise(resolve => {
                this._withAIClient((aiClient) => {
                    aiClient.unload(true, () => {
                        this._aiCoreOrKey = undefined;
                        resolve(undefined);
                    });
                });
            });
        }
        return Promise.resolve(undefined);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiMWRzQXBwZW5kZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uLzFkc0FwcGVuZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFzQixxQkFBcUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBVWhGLE1BQU0sV0FBVyxHQUFHLDJEQUEyRCxDQUFDO0FBQ2hGLE1BQU0saUJBQWlCLEdBQUcsK0NBQStDLENBQUM7QUFFMUUsS0FBSyxVQUFVLFNBQVMsQ0FBQyxrQkFBMEIsRUFBRSxlQUF5QixFQUFFLFdBQTBCO0lBQ3pHLHNEQUFzRDtJQUN0RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sbUJBQW1CLENBQTBDLHdCQUF3QixFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sTUFBTSxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDckwsc0RBQXNEO0lBQ3RELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxtQkFBbUIsQ0FBMEMsd0JBQXdCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxNQUFNLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUUxTCxNQUFNLGVBQWUsR0FBRyxJQUFJLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUNwRCxNQUFNLHNCQUFzQixHQUFnQixJQUFJLFVB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