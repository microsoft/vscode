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
exports.TypeScriptReferencesCodeLensProvider = void 0;
exports.register = register;
const vscode = __importStar(require("vscode"));
const PConst = __importStar(require("../../tsServer/protocol/protocol.const"));
const server_1 = require("../../tsServer/server");
const typeConverters = __importStar(require("../../typeConverters"));
const typescriptService_1 = require("../../typescriptService");
const configuration_1 = require("../../utils/configuration");
const dependentRegistration_1 = require("../util/dependentRegistration");
const baseCodeLensProvider_1 = require("./baseCodeLensProvider");
const Config = Object.freeze({
    enabled: 'referencesCodeLens.enabled',
    showOnAllFunctions: 'referencesCodeLens.showOnAllFunctions',
});
class TypeScriptReferencesCodeLensProvider extends baseCodeLensProvider_1.TypeScriptBaseCodeLensProvider {
    _cachedResponse;
    _enabled;
    _showOnAllFunctions;
    constructor(client, _cachedResponse) {
        super(client, _cachedResponse);
        this._cachedResponse = _cachedResponse;
        this._enabled = this._register(new configuration_1.ResourceUnifiedConfigValue(Config.enabled, false));
        this._register(this._enabled.onDidChange(() => this.changeEmitter.fire()));
        this._showOnAllFunctions = this._register(new configuration_1.ResourceUnifiedConfigValue(Config.showOnAllFunctions, false));
        this._register(this._showOnAllFunctions.onDidChange(() => this.changeEmitter.fire()));
    }
    async provideCodeLenses(document, token) {
        const enabled = this._enabled.getValue(document);
        if (!enabled) {
            return [];
        }
        return super.provideCodeLenses(document, token);
    }
    async resolveCodeLens(codeLens, token) {
        const args = typeConverters.Position.toFileLocationRequestArgs(codeLens.file, codeLens.range.start);
        const response = await this.client.execute('references', args, token, {
            lowPriority: true,
            executionTarget: server_1.ExecutionTarget.Semantic,
            cancelOnResourceChange: codeLens.document,
        });
        if (response.type !== 'response' || !response.body) {
            codeLens.command = response.type === 'cancelled'
                ? baseCodeLensProvider_1.TypeScriptBaseCodeLensProvider.cancelledCommand
                : baseCodeLensProvider_1.TypeScriptBaseCodeLensProvider.errorCommand;
            return codeLens;
        }
        const locations = response.body.refs
            .filter(reference => !reference.isDefinition)
            .map(reference => typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));
        codeLens.command = {
            title: this.getCodeLensLabel(locations),
            command: locations.length ? 'editor.action.showReferences' : '',
            arguments: [codeLens.document, codeLens.range.start, locations]
        };
        return codeLens;
    }
    getCodeLensLabel(locations) {
        return locations.length === 1
            ? vscode.l10n.t("1 reference")
            : vscode.l10n.t("{0} references", locations.length);
    }
    extractSymbol(document, item, parent) {
        if (parent && parent.kind === PConst.Kind.enum) {
            return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
        }
        switch (item.kind) {
            case PConst.Kind.function: {
                const showOnAllFunctions = this._showOnAllFunctions.getValue(document);
                if (showOnAllFunctions && item.nameSpan) {
                    return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
                }
            }
            // fallthrough
            case PConst.Kind.const:
            case PConst.Kind.let:
            case PConst.Kind.variable:
                // Only show references for exported variables
                if (/\bexport\b/.test(item.kindModifiers)) {
                    return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
                }
                break;
            case PConst.Kind.class:
                if (item.text === '<class>') {
                    break;
                }
                return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
            case PConst.Kind.interface:
            case PConst.Kind.type:
            case PConst.Kind.enum:
                return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
            case PConst.Kind.method:
            case PConst.Kind.memberGetAccessor:
            case PConst.Kind.memberSetAccessor:
            case PConst.Kind.constructorImplementation:
            case PConst.Kind.memberVariable:
                // Don't show if child and parent have same start
                // For https://github.com/microsoft/vscode/issues/90396
                if (parent &&
                    typeConverters.Position.fromLocation(parent.spans[0].start).isEqual(typeConverters.Position.fromLocation(item.spans[0].start))) {
                    return undefined;
                }
                // Only show if parent is a class type object (not a literal)
                switch (parent?.kind) {
                    case PConst.Kind.class:
                    case PConst.Kind.interface:
                    case PConst.Kind.type:
                        return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
                }
                break;
        }
        return undefined;
    }
}
exports.TypeScriptReferencesCodeLensProvider = TypeScriptReferencesCodeLensProvider;
function register(selector, language, client, cachedResponse) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireHasModifiedUnifiedConfig)(Config.enabled, language.id),
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerCodeLensProvider(selector.semantic, new TypeScriptReferencesCodeLensProvider(client, cachedResponse));
    });
}
//# sourceMappingURL=referencesCodeLens.js.map