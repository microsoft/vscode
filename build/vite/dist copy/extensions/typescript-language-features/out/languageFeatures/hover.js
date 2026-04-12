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
const typescriptService_1 = require("../typescriptService");
const dependentRegistration_1 = require("./util/dependentRegistration");
const textRendering_1 = require("./util/textRendering");
const typeConverters = __importStar(require("../typeConverters"));
const api_1 = require("../tsServer/api");
class TypeScriptHoverProvider {
    client;
    fileConfigurationManager;
    lastHoverAndLevel;
    constructor(client, fileConfigurationManager) {
        this.client = client;
        this.fileConfigurationManager = fileConfigurationManager;
    }
    async provideHover(document, position, token, context) {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return undefined;
        }
        let verbosityLevel;
        if (this.client.apiVersion.gte(api_1.API.v590)) {
            verbosityLevel = Math.max(0, this.getPreviousLevel(context?.previousHover) + (context?.verbosityDelta ?? 0));
        }
        const args = { ...typeConverters.Position.toFileLocationRequestArgs(filepath, position), verbosityLevel };
        const response = await this.client.interruptGetErr(async () => {
            await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
            return this.client.execute('quickinfo', args, token);
        });
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        const contents = this.getContents(document.uri, response.body, response._serverType);
        const range = typeConverters.Range.fromTextSpan(response.body);
        const hover = verbosityLevel !== undefined ?
            new vscode.VerboseHover(contents, range, 
            /*canIncreaseVerbosity*/ response.body.canIncreaseVerbosityLevel, 
            /*canDecreaseVerbosity*/ verbosityLevel !== 0) : new vscode.Hover(contents, range);
        if (verbosityLevel !== undefined) {
            this.lastHoverAndLevel = [hover, verbosityLevel];
        }
        return hover;
    }
    getContents(resource, data, source) {
        const parts = [];
        if (data.displayString) {
            const displayParts = [];
            if (source === typescriptService_1.ServerType.Syntax && this.client.hasCapabilityForResource(resource, typescriptService_1.ClientCapability.Semantic)) {
                displayParts.push(vscode.l10n.t({
                    message: "(loading...)",
                    comment: ['Prefix displayed for hover entries while the server is still loading']
                }));
            }
            displayParts.push(data.displayString);
            parts.push(new vscode.MarkdownString().appendCodeblock(displayParts.join(' '), 'typescript'));
        }
        const md = (0, textRendering_1.documentationToMarkdown)(data.documentation, data.tags, this.client, resource);
        parts.push(md);
        return parts;
    }
    getPreviousLevel(previousHover) {
        if (previousHover && this.lastHoverAndLevel && this.lastHoverAndLevel[0] === previousHover) {
            return this.lastHoverAndLevel[1];
        }
        return 0;
    }
}
function register(selector, client, fileConfigurationManager) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.EnhancedSyntax, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerHoverProvider(selector.syntax, new TypeScriptHoverProvider(client, fileConfigurationManager));
    });
}
//# sourceMappingURL=hover.js.map