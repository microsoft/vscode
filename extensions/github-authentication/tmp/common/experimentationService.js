"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExperimentationTelemetry = void 0;
const vscode = require("vscode");
const vscode_tas_client_1 = require("vscode-tas-client");
class ExperimentationTelemetry {
    constructor(context, baseReporter) {
        this.context = context;
        this.baseReporter = baseReporter;
        this.sharedProperties = {};
    }
    async createExperimentationService() {
        let targetPopulation;
        switch (vscode.env.uriScheme) {
            case 'vscode':
                targetPopulation = vscode_tas_client_1.TargetPopulation.Public;
                break;
            case 'vscode-insiders':
                targetPopulation = vscode_tas_client_1.TargetPopulation.Insiders;
                break;
            case 'vscode-exploration':
                targetPopulation = vscode_tas_client_1.TargetPopulation.Internal;
                break;
            case 'code-oss':
                targetPopulation = vscode_tas_client_1.TargetPopulation.Team;
                break;
            default:
                targetPopulation = vscode_tas_client_1.TargetPopulation.Public;
                break;
        }
        const id = this.context.extension.id;
        const version = this.context.extension.packageJSON.version;
        const experimentationService = (0, vscode_tas_client_1.getExperimentationService)(id, version, targetPopulation, this, this.context.globalState);
        await experimentationService.initialFetch;
        return experimentationService;
    }
    /**
     * @returns A promise that you shouldn't need to await because this is just telemetry.
     */
    async sendTelemetryEvent(eventName, properties, measurements) {
        if (!this.experimentationServicePromise) {
            this.experimentationServicePromise = this.createExperimentationService();
        }
        await this.experimentationServicePromise;
        this.baseReporter.sendTelemetryEvent(eventName, {
            ...this.sharedProperties,
            ...properties,
        }, measurements);
    }
    /**
     * @returns A promise that you shouldn't need to await because this is just telemetry.
     */
    async sendTelemetryErrorEvent(eventName, properties, _measurements) {
        if (!this.experimentationServicePromise) {
            this.experimentationServicePromise = this.createExperimentationService();
        }
        await this.experimentationServicePromise;
        this.baseReporter.sendTelemetryErrorEvent(eventName, {
            ...this.sharedProperties,
            ...properties,
        });
    }
    setSharedProperty(name, value) {
        this.sharedProperties[name] = value;
    }
    postEvent(eventName, props) {
        const event = {};
        for (const [key, value] of props) {
            event[key] = value;
        }
        this.sendTelemetryEvent(eventName, event);
    }
    dispose() {
        return this.baseReporter.dispose();
    }
}
exports.ExperimentationTelemetry = ExperimentationTelemetry;
