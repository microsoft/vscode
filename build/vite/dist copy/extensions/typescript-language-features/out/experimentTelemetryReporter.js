"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExperimentationTelemetryReporter = void 0;
/**
 * This reporter *supports* experimentation telemetry,
 * but will only do so when passed to an {@link ExperimentationService}.
 */
class ExperimentationTelemetryReporter {
    _sharedProperties = {};
    _reporter;
    constructor(reporter) {
        this._reporter = reporter;
    }
    setSharedProperty(name, value) {
        this._sharedProperties[name] = value;
    }
    postEvent(eventName, props) {
        const propsObject = {
            ...this._sharedProperties,
            ...Object.fromEntries(props),
        };
        this._reporter.sendTelemetryEvent(eventName, propsObject);
    }
    postEventObj(eventName, props) {
        this._reporter.sendTelemetryEvent(eventName, {
            ...this._sharedProperties,
            ...props,
        });
    }
    dispose() {
        this._reporter.dispose();
    }
}
exports.ExperimentationTelemetryReporter = ExperimentationTelemetryReporter;
//# sourceMappingURL=experimentTelemetryReporter.js.map