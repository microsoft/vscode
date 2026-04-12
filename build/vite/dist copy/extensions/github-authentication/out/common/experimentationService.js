"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExperimentationTelemetry = void 0;
const vscode = __importStar(require("vscode"));
const vscode_tas_client_1 = require("vscode-tas-client");
class ExperimentationTelemetry {
    context;
    baseReporter;
    sharedProperties = {};
    experimentationServicePromise;
    constructor(context, baseReporter) {
        this.context = context;
        this.baseReporter = baseReporter;
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
//# sourceMappingURL=experimentationService.js.map