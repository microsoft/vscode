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
const api_1 = require("../tsServer/api");
const protocol_const_1 = require("../tsServer/protocol/protocol.const");
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const cancellation_1 = require("../utils/cancellation");
const dependentRegistration_1 = require("./util/dependentRegistration");
const organizeImportsCommand = {
    commandIds: [], // We use the generic 'Organize imports' command
    title: vscode.l10n.t("Organize Imports"),
    kind: vscode.CodeActionKind.SourceOrganizeImports,
    mode: protocol_const_1.OrganizeImportsMode.All,
};
const sortImportsCommand = {
    commandIds: ['typescript.sortImports', 'javascript.sortImports'],
    minVersion: api_1.API.v430,
    title: vscode.l10n.t("Sort Imports"),
    kind: vscode.CodeActionKind.Source.append('sortImports'),
    mode: protocol_const_1.OrganizeImportsMode.SortAndCombine,
};
const removeUnusedImportsCommand = {
    commandIds: ['typescript.removeUnusedImports', 'javascript.removeUnusedImports'],
    minVersion: api_1.API.v490,
    title: vscode.l10n.t("Remove Unused Imports"),
    kind: vscode.CodeActionKind.Source.append('removeUnusedImports'),
    mode: protocol_const_1.OrganizeImportsMode.RemoveUnused,
};
class DidOrganizeImportsCommand {
    telemetryReporter;
    static ID = '_typescript.didOrganizeImports';
    id = DidOrganizeImportsCommand.ID;
    constructor(telemetryReporter) {
        this.telemetryReporter = telemetryReporter;
    }
    async execute() {
        /* __GDPR__
            "organizeImports.execute" : {
                "owner": "mjbvz",
                "${include}": [
                    "${TypeScriptCommonProperties}"
                ]
            }
        */
        this.telemetryReporter.logTelemetry('organizeImports.execute', {});
    }
}
class ImportCodeAction extends vscode.CodeAction {
    document;
    constructor(title, kind, document) {
        super(title, kind);
        this.document = document;
    }
}
class ImportsCodeActionProvider {
    client;
    commandMetadata;
    fileConfigManager;
    constructor(client, commandMetadata, commandManager, fileConfigManager, telemetryReporter) {
        this.client = client;
        this.commandMetadata = commandMetadata;
        this.fileConfigManager = fileConfigManager;
        commandManager.register(new DidOrganizeImportsCommand(telemetryReporter));
    }
    provideCodeActions(document, _range, context, _token) {
        if (!context.only?.contains(this.commandMetadata.kind)) {
            return [];
        }
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return [];
        }
        return [new ImportCodeAction(this.commandMetadata.title, this.commandMetadata.kind, document)];
    }
    async resolveCodeAction(codeAction, token) {
        const response = await this.client.interruptGetErr(async () => {
            await this.fileConfigManager.ensureConfigurationForDocument(codeAction.document, token);
            if (token.isCancellationRequested) {
                return;
            }
            const file = this.client.toOpenTsFilePath(codeAction.document);
            if (!file) {
                return;
            }
            const args = {
                scope: {
                    type: 'file',
                    args: { file }
                },
                // Deprecated in 4.9; `mode` takes priority
                skipDestructiveCodeActions: this.commandMetadata.mode === protocol_const_1.OrganizeImportsMode.SortAndCombine,
                mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.commandMetadata.mode),
            };
            return this.client.execute('organizeImports', args, cancellation_1.nulToken);
        });
        if (response?.type !== 'response' || !response.body || token.isCancellationRequested) {
            return;
        }
        if (response.body.length) {
            codeAction.edit = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
        }
        codeAction.command = { command: DidOrganizeImportsCommand.ID, title: '', arguments: [] };
        return codeAction;
    }
}
function register(selector, client, commandManager, fileConfigurationManager, telemetryReporter) {
    const disposables = [];
    for (const command of [organizeImportsCommand, sortImportsCommand, removeUnusedImportsCommand]) {
        disposables.push((0, dependentRegistration_1.conditionalRegistration)([
            (0, dependentRegistration_1.requireMinVersion)(client, command.minVersion ?? api_1.API.defaultVersion),
            (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
        ], () => {
            const provider = new ImportsCodeActionProvider(client, command, commandManager, fileConfigurationManager, telemetryReporter);
            return vscode.Disposable.from(vscode.languages.registerCodeActionsProvider(selector.semantic, provider, {
                providedCodeActionKinds: [command.kind]
            }));
        }), 
        // Always register these commands. We will show a warning if the user tries to run them on an unsupported version
        ...command.commandIds.map(id => commandManager.register({
            id,
            execute() {
                return vscode.commands.executeCommand('editor.action.sourceAction', {
                    kind: command.kind.value,
                    apply: 'first',
                });
            }
        })));
    }
    return vscode.Disposable.from(...disposables);
}
//# sourceMappingURL=organizeImports.js.map