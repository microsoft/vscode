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
exports.register = register;
const vscode = __importStar(require("vscode"));
const PConst = __importStar(require("../../tsServer/protocol/protocol.const"));
const typeConverters = __importStar(require("../../typeConverters"));
const typescriptService_1 = require("../../typescriptService");
const configuration_1 = require("../../utils/configuration");
const dependentRegistration_1 = require("../util/dependentRegistration");
const baseCodeLensProvider_1 = require("./baseCodeLensProvider");
const server_1 = require("../../tsServer/server");
const Config = Object.freeze({
    enabled: 'implementationsCodeLens.enabled',
    showOnInterfaceMethods: 'implementationsCodeLens.showOnInterfaceMethods',
    showOnAllClassMethods: 'implementationsCodeLens.showOnAllClassMethods',
});
class TypeScriptImplementationsCodeLensProvider extends baseCodeLensProvider_1.TypeScriptBaseCodeLensProvider {
    _cachedResponse;
    _enabled;
    _showOnInterfaceMethods;
    _showOnAllClassMethods;
    constructor(client, _cachedResponse) {
        super(client, _cachedResponse);
        this._cachedResponse = _cachedResponse;
        this._enabled = this._register(new configuration_1.ResourceUnifiedConfigValue(Config.enabled, false));
        this._register(this._enabled.onDidChange(() => this.changeEmitter.fire()));
        this._showOnInterfaceMethods = this._register(new configuration_1.ResourceUnifiedConfigValue(Config.showOnInterfaceMethods, false));
        this._register(this._showOnInterfaceMethods.onDidChange(() => this.changeEmitter.fire()));
        this._showOnAllClassMethods = this._register(new configuration_1.ResourceUnifiedConfigValue(Config.showOnAllClassMethods, false));
        this._register(this._showOnAllClassMethods.onDidChange(() => this.changeEmitter.fire()));
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
        const response = await this.client.execute('implementation', args, token, {
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
        const locations = response.body
            .map(reference => 
        // Only take first line on implementation: https://github.com/microsoft/vscode/issues/23924
        new vscode.Location(this.client.toResource(reference.file), reference.start.line === reference.end.line
            ? typeConverters.Range.fromTextSpan(reference)
            : new vscode.Range(typeConverters.Position.fromLocation(reference.start), new vscode.Position(reference.start.line, 0))))
            // Exclude original from implementations
            .filter(location => !(location.uri.toString() === codeLens.document.toString() &&
            location.range.start.line === codeLens.range.start.line &&
            location.range.start.character === codeLens.range.start.character));
        codeLens.command = this.getCommand(locations, codeLens);
        return codeLens;
    }
    getCommand(locations, codeLens) {
        return {
            title: this.getTitle(locations),
            command: locations.length ? 'editor.action.showReferences' : '',
            arguments: [codeLens.document, codeLens.range.start, locations]
        };
    }
    getTitle(locations) {
        return locations.length === 1
            ? vscode.l10n.t("1 implementation")
            : vscode.l10n.t("{0} implementations", locations.length);
    }
    extractSymbol(document, item, parent) {
        // Always show on interfaces
        if (item.kind === PConst.Kind.interface) {
            return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
        }
        // Always show on abstract classes/properties
        if ((item.kind === PConst.Kind.class ||
            item.kind === PConst.Kind.method ||
            item.kind === PConst.Kind.memberVariable ||
            item.kind === PConst.Kind.memberGetAccessor ||
            item.kind === PConst.Kind.memberSetAccessor) &&
            /\babstract\b/.test(item.kindModifiers ?? '')) {
            return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
        }
        // If configured, show on interface methods
        if (item.kind === PConst.Kind.method &&
            parent?.kind === PConst.Kind.interface &&
            this._showOnInterfaceMethods.getValue(document)) {
            return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
        }
        // If configured, show on all class methods
        if (item.kind === PConst.Kind.method &&
            parent?.kind === PConst.Kind.class &&
            this._showOnAllClassMethods.getValue(document)) {
            // But not private ones as these can never be overridden
            if (/\bprivate\b/.test(item.kindModifiers ?? '')) {
                return undefined;
            }
            return (0, baseCodeLensProvider_1.getSymbolRange)(document, item);
        }
        return undefined;
    }
}
exports.default = TypeScriptImplementationsCodeLensProvider;
function register(selector, language, client, cachedResponse) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireHasModifiedUnifiedConfig)(Config.enabled, language.id),
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerCodeLensProvider(selector.semantic, new TypeScriptImplementationsCodeLensProvider(client, cachedResponse));
    });
}
//# sourceMappingURL=implementationsCodeLens.js.map