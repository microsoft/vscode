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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const vscode = __importStar(require("vscode"));
const api_1 = require("../tsServer/api");
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const definitionProviderBase_1 = __importDefault(require("./definitionProviderBase"));
const configuration_1 = require("../utils/configuration");
const dependentRegistration_1 = require("./util/dependentRegistration");
class TypeScriptDefinitionProvider extends definitionProviderBase_1.default {
    async provideDefinition(document, position, token) {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return undefined;
        }
        const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
        const response = await this.client.execute('definitionAndBoundSpan', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        const span = response.body.textSpan ? typeConverters.Range.fromTextSpan(response.body.textSpan) : undefined;
        let definitions = response.body.definitions;
        if ((0, configuration_1.readUnifiedConfig)('preferGoToSourceDefinition', false, { scope: document, fallbackSection: document.languageId }) && this.client.apiVersion.gte(api_1.API.v470)) {
            const sourceDefinitionsResponse = await this.client.execute('findSourceDefinition', args, token);
            if (sourceDefinitionsResponse.type === 'response' && sourceDefinitionsResponse.body?.length) {
                definitions = sourceDefinitionsResponse.body;
            }
        }
        return definitions
            .map((location) => {
            const target = typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location);
            if (location.contextStart && location.contextEnd) {
                return {
                    originSelectionRange: span,
                    targetRange: typeConverters.Range.fromLocations(location.contextStart, location.contextEnd),
                    targetUri: target.uri,
                    targetSelectionRange: target.range,
                };
            }
            return {
                originSelectionRange: span,
                targetRange: target.range,
                targetUri: target.uri
            };
        });
    }
}
exports.default = TypeScriptDefinitionProvider;
function register(selector, client) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.EnhancedSyntax, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerDefinitionProvider(selector.syntax, new TypeScriptDefinitionProvider(client));
    });
}
//# sourceMappingURL=definitions.js.map