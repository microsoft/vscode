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
exports.registerUpdatePastedLinks = registerUpdatePastedLinks;
const vscode = __importStar(require("vscode"));
const mimes_1 = require("../util/mimes");
class UpdatePastedLinksEditProvider {
    static kind = vscode.DocumentDropOrPasteEditKind.Text.append('updateLinks', 'markdown');
    static metadataMime = 'application/vnd.vscode.markdown.updatelinks.metadata';
    #client;
    constructor(client) {
        this.#client = client;
    }
    async prepareDocumentPaste(document, ranges, dataTransfer, token) {
        if (!this.#isEnabled(document)) {
            return;
        }
        const metadata = await this.#client.prepareUpdatePastedLinks(document.uri, ranges, token);
        if (token.isCancellationRequested) {
            return;
        }
        dataTransfer.set(UpdatePastedLinksEditProvider.metadataMime, new vscode.DataTransferItem(metadata));
    }
    async provideDocumentPasteEdits(document, ranges, dataTransfer, context, token) {
        if (!this.#isEnabled(document)) {
            return;
        }
        const metadata = dataTransfer.get(UpdatePastedLinksEditProvider.metadataMime)?.value;
        if (!metadata) {
            return;
        }
        const textItem = dataTransfer.get(mimes_1.Mime.textPlain);
        const text = await textItem?.asString();
        if (!text || token.isCancellationRequested) {
            return;
        }
        // TODO: Handle cases such as:
        // - copy empty line
        // - Copy with multiple cursors and paste into multiple locations
        // - ...
        const edits = await this.#client.getUpdatePastedLinksEdit(document.uri, ranges.map(x => new vscode.TextEdit(x, text)), metadata, token);
        if (!edits?.length || token.isCancellationRequested) {
            return;
        }
        const pasteEdit = new vscode.DocumentPasteEdit('', vscode.l10n.t("Paste and update pasted links"), UpdatePastedLinksEditProvider.kind);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, edits.map(x => new vscode.TextEdit(new vscode.Range(x.range.start.line, x.range.start.character, x.range.end.line, x.range.end.character), x.newText)));
        pasteEdit.additionalEdit = workspaceEdit;
        if (!context.only || !UpdatePastedLinksEditProvider.kind.contains(context.only)) {
            pasteEdit.yieldTo = [vscode.DocumentDropOrPasteEditKind.Text];
        }
        return [pasteEdit];
    }
    #isEnabled(document) {
        return vscode.workspace.getConfiguration('markdown', document.uri).get('editor.updateLinksOnPaste.enabled', true);
    }
}
function registerUpdatePastedLinks(selector, client) {
    return vscode.languages.registerDocumentPasteEditProvider(selector, new UpdatePastedLinksEditProvider(client), {
        copyMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
        providedPasteEditKinds: [UpdatePastedLinksEditProvider.kind],
        pasteMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
    });
}
//# sourceMappingURL=updateLinksOnPaste.js.map