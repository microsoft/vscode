"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeTelemetryReporter = void 0;
class VSCodeTelemetryReporter {
    reporter;
    clientVersionDelegate;
    constructor(reporter, clientVersionDelegate) {
        this.reporter = reporter;
        this.clientVersionDelegate = clientVersionDelegate;
    }
    logTelemetry(eventName, properties = {}) {
        const reporter = this.reporter;
        if (!reporter) {
            return;
        }
        /* __GDPR__FRAGMENT__
            "TypeScriptCommonProperties" : {
                "version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        properties['version'] = this.clientVersionDelegate();
        reporter.postEventObj(eventName, properties);
    }
    logTraceEvent(point, traceId, data) {
        const event = {
            point,
            traceId
        };
        if (data) {
            event.data = data;
        }
        /* __GDPR__
            "typeScriptExtension.trace" : {
                "owner": "dirkb",
                "${include}": [
                    "${TypeScriptCommonProperties}"
                ],
                "point" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The trace point." },
                "traceId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The traceId is used to correlate the request with other trace points." },
                "data": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Additional data" }
            }
        */
        this.logTelemetry('typeScriptExtension.trace', event);
    }
}
exports.VSCodeTelemetryReporter = VSCodeTelemetryReporter;
//# sourceMappingURL=telemetry.js.map