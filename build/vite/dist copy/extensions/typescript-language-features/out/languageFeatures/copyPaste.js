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
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const async_1 = require("../utils/async");
const configuration_1 = require("../utils/configuration");
const dependentRegistration_1 = require("./util/dependentRegistration");
class CopyMetadata {
    resource;
    ranges;
    copyOperation;
    static parse(data) {
        try {
            const parsedData = JSON.parse(data);
            const resource = vscode.Uri.parse(parsedData.resource);
            const ranges = parsedData.ranges.map((range) => new vscode.Range(range.start, range.end));
            const copyOperation = parsedData.copyOperation ? Promise.resolve(parsedData.copyOperation) : undefined;
            return new CopyMetadata(resource, ranges, copyOperation);
        }
        catch (error) {
            return undefined;
        }
    }
    constructor(resource, ranges, copyOperation) {
        this.resource = resource;
        this.ranges = ranges;
        this.copyOperation = copyOperation;
    }
}
class TsPasteEdit extends vscode.DocumentPasteEdit {
    static tryCreateFromResponse(client, response) {
        if (response.type !== 'response' || !response.body?.edits.length) {
            return undefined;
        }
        const pasteEdit = new TsPasteEdit();
        const additionalEdit = new vscode.WorkspaceEdit();
        for (const edit of response.body.edits) {
            additionalEdit.set(client.toResource(edit.fileName), edit.textChanges.map(typeConverters.TextEdit.fromCodeEdit));
        }
        pasteEdit.additionalEdit = additionalEdit;
        return pasteEdit;
    }
    constructor() {
        super('', vscode.l10n.t("Paste with imports"), DocumentPasteProvider.kind);
        this.yieldTo = [
            vscode.DocumentDropOrPasteEditKind.Text.append('plain')
        ];
    }
}
class TsPendingPasteEdit extends TsPasteEdit {
    operation;
    constructor(text, operation) {
        super();
        this.operation = operation;
        this.insertText = text;
    }
}
const enabledSettingId = 'updateImportsOnPaste.enabled';
class DocumentPasteProvider {
    _modeId;
    _client;
    fileConfigurationManager;
    static kind = vscode.DocumentDropOrPasteEditKind.TextUpdateImports.append('jsts');
    static metadataMimeType = 'application/vnd.code.jsts.metadata';
    constructor(_modeId, _client, fileConfigurationManager) {
        this._modeId = _modeId;
        this._client = _client;
        this.fileConfigurationManager = fileConfigurationManager;
    }
    async prepareDocumentPaste(document, ranges, dataTransfer, token) {
        if (!this.isEnabled(document)) {
            return;
        }
        const file = this._client.toOpenTsFilePath(document);
        if (!file) {
            return;
        }
        const copyRequest = this._client.interruptGetErr(() => this._client.execute('preparePasteEdits', {
            file,
            copiedTextSpan: ranges.map(typeConverters.Range.toTextSpan),
        }, token));
        const copyTimeout = 200;
        const response = await (0, async_1.raceTimeout)(copyRequest, copyTimeout);
        if (token.isCancellationRequested) {
            return;
        }
        if (response) {
            if (response.type !== 'response' || !response.body) {
                // We got a response which told us no to bother with the paste
                // Don't store anything so that we don't trigger on paste
                return;
            }
            dataTransfer.set(DocumentPasteProvider.metadataMimeType, new vscode.DataTransferItem(new CopyMetadata(document.uri, ranges, undefined)));
        }
        else {
            // We are still waiting on the response. Store the pending request so that we can try checking it on paste
            // when it has hopefully resolved
            dataTransfer.set(DocumentPasteProvider.metadataMimeType, new vscode.DataTransferItem(new CopyMetadata(document.uri, ranges, copyRequest)));
        }
    }
    async provideDocumentPasteEdits(document, ranges, dataTransfer, _context, token) {
        if (!this.isEnabled(document)) {
            return;
        }
        const file = this._client.toOpenTsFilePath(document);
        if (!file) {
            return;
        }
        const text = await dataTransfer.get('text/plain')?.asString();
        if (!text || token.isCancellationRequested) {
            return;
        }
        // Get optional metadata
        const metadata = await this.extractMetadata(dataTransfer, token);
        if (token.isCancellationRequested) {
            return;
        }
        let copiedFrom;
        if (metadata) {
            const spans = metadata.ranges.map(typeConverters.Range.toTextSpan);
            const copyFile = this._client.toTsFilePath(metadata.resource);
            if (copyFile) {
                copiedFrom = { file: copyFile, spans };
            }
        }
        if (copiedFrom?.file === file) {
            // We are pasting in the same file we copied from. No need to do anything
            return;
        }
        const pasteCts = new vscode.CancellationTokenSource();
        token.onCancellationRequested(() => pasteCts.cancel());
        // If we have a copy operation, use that to potentially eagerly cancel the paste if it resolves to false
        metadata?.copyOperation?.then(copyResponse => {
            if (copyResponse.type !== 'response' || !copyResponse.body) {
                pasteCts.cancel();
            }
        }, (_err) => {
            // Expected. May have been cancelled.
        });
        try {
            const pasteOperation = this._client.interruptGetErr(() => {
                this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
                return this._client.execute('getPasteEdits', {
                    file,
                    // TODO: only supports a single paste for now
                    pastedText: [text],
                    pasteLocations: ranges.map(typeConverters.Range.toTextSpan),
                    copiedFrom
                }, pasteCts.token);
            });
            const pasteTimeout = 200;
            const response = await (0, async_1.raceTimeout)(pasteOperation, pasteTimeout);
            if (response) {
                // Success, can return real paste edit.
                const edit = TsPasteEdit.tryCreateFromResponse(this._client, response);
                return edit ? [edit] : undefined;
            }
            else {
                // Still waiting on the response. Eagerly return a paste edit that we will resolve when we
                // really need to apply it
                return [new TsPendingPasteEdit(text, pasteOperation)];
            }
        }
        finally {
            pasteCts.dispose();
        }
    }
    async resolveDocumentPasteEdit(inEdit, _token) {
        if (!(inEdit instanceof TsPendingPasteEdit)) {
            return;
        }
        const response = await inEdit.operation;
        const pasteEdit = TsPendingPasteEdit.tryCreateFromResponse(this._client, response);
        return pasteEdit ?? inEdit;
    }
    async extractMetadata(dataTransfer, token) {
        const metadata = await dataTransfer.get(DocumentPasteProvider.metadataMimeType)?.value;
        if (token.isCancellationRequested) {
            return undefined;
        }
        if (metadata instanceof CopyMetadata) {
            return metadata;
        }
        if (typeof metadata === 'string') {
            return CopyMetadata.parse(metadata);
        }
        return undefined;
    }
    isEnabled(document) {
        return (0, configuration_1.readUnifiedConfig)(enabledSettingId, true, { scope: document, fallbackSection: this._modeId });
    }
}
function register(selector, language, client, fileConfigurationManager) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
        (0, dependentRegistration_1.requireMinVersion)(client, api_1.API.v570),
        (0, dependentRegistration_1.requireGlobalUnifiedConfig)(enabledSettingId, { fallbackSection: language.id }),
    ], () => {
        return vscode.languages.registerDocumentPasteEditProvider(selector.semantic, new DocumentPasteProvider(language.id, client, fileConfigurationManager), {
            providedPasteEditKinds: [DocumentPasteProvider.kind],
            copyMimeTypes: [DocumentPasteProvider.metadataMimeType],
            pasteMimeTypes: [DocumentPasteProvider.metadataMimeType],
        });
    });
}
//# sourceMappingURL=copyPaste.js.map