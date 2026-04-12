"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExperimentationService = createExperimentationService;
const vscode_tas_client_1 = require("vscode-tas-client");
async function createExperimentationService(context, experimentationTelemetry, isPreRelease) {
    const id = context.extension.id;
    const version = context.extension.packageJSON['version'];
    const service = (0, vscode_tas_client_1.getExperimentationService)(id, version, isPreRelease ? vscode_tas_client_1.TargetPopulation.Insiders : vscode_tas_client_1.TargetPopulation.Public, experimentationTelemetry, context.globalState);
    await service.initializePromise;
    await service.initialFetch;
    return service;
}
//# sourceMappingURL=experimentation.js.map