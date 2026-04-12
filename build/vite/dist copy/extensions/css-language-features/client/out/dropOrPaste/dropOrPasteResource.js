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
exports.registerDropOrPasteResourceSupport = registerDropOrPasteResourceSupport;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const shared_1 = require("./shared");
const uriList_1 = require("./uriList");
class DropOrPasteResourceProvider {
    kind = vscode.DocumentDropOrPasteEditKind.Empty.append('css', 'link', 'url');
    async provideDocumentDropEdits(document, position, dataTransfer, token) {
        const uriList = await this.getUriList(dataTransfer);
        if (!uriList.entries.length || token.isCancellationRequested) {
            return;
        }
        const snippet = await this.createUriListSnippet(document.uri, uriList);
        if (!snippet || token.isCancellationRequested) {
            return;
        }
        return {
            kind: this.kind,
            title: snippet.label,
            insertText: snippet.snippet.value,
            yieldTo: this.pasteAsCssUrlByDefault(document, position) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
        };
    }
    async provideDocumentPasteEdits(document, ranges, dataTransfer, _context, token) {
        const uriList = await this.getUriList(dataTransfer);
        if (!uriList.entries.length || token.isCancellationRequested) {
            return;
        }
        const snippet = await this.createUriListSnippet(document.uri, uriList);
        if (!snippet || token.isCancellationRequested) {
            return;
        }
        return [{
                kind: this.kind,
                title: snippet.label,
                insertText: snippet.snippet.value,
                yieldTo: this.pasteAsCssUrlByDefault(document, ranges[0].start) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
            }];
    }
    async getUriList(dataTransfer) {
        const urlList = await dataTransfer.get(shared_1.Mimes.uriList)?.asString();
        if (urlList) {
            return uriList_1.UriList.from(urlList);
        }
        // Find file entries
        const uris = [];
        for (const [_, entry] of dataTransfer) {
            const file = entry.asFile();
            if (file?.uri) {
                uris.push(file.uri);
            }
        }
        return new uriList_1.UriList(uris.map(uri => ({ uri, str: uri.toString(true) })));
    }
    async createUriListSnippet(docUri, uriList) {
        if (!uriList.entries.length) {
            return;
        }
        const snippet = new vscode.SnippetString();
        for (let i = 0; i < uriList.entries.length; i++) {
            const uri = uriList.entries[i];
            const relativePath = getRelativePath((0, shared_1.getDocumentDir)(docUri), uri.uri);
            const urlText = relativePath ?? uri.str;
            snippet.appendText(`url(${urlText})`);
            if (i !== uriList.entries.length - 1) {
                snippet.appendText(' ');
            }
        }
        return {
            snippet,
            label: uriList.entries.length > 1
                ? vscode.l10n.t('Insert url() Functions')
                : vscode.l10n.t('Insert url() Function')
        };
    }
    pasteAsCssUrlByDefault(document, position) {
        const regex = /url\(.+?\)/gi;
        for (const match of Array.from(document.lineAt(position.line).text.matchAll(regex))) {
            if (position.character > match.index && position.character < match.index + match[0].length) {
                return false;
            }
        }
        return true;
    }
}
function getRelativePath(fromFile, toFile) {
    if (fromFile && fromFile.scheme === toFile.scheme && fromFile.authority === toFile.authority) {
        if (toFile.scheme === shared_1.Schemes.file) {
            // On windows, we must use the native `path.relative` to generate the relative path
            // so that drive-letters are resolved cast insensitively. However we then want to
            // convert back to a posix path to insert in to the document
            const relativePath = path.relative(fromFile.fsPath, toFile.fsPath);
            return path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep));
        }
        return path.posix.relative(fromFile.path, toFile.path);
    }
    return undefined;
}
function registerDropOrPasteResourceSupport(selector) {
    const provider = new DropOrPasteResourceProvider();
    return vscode.Disposable.from(vscode.languages.registerDocumentDropEditProvider(selector, provider, {
        providedDropEditKinds: [provider.kind],
        dropMimeTypes: [
            shared_1.Mimes.uriList,
            'files'
        ]
    }), vscode.languages.registerDocumentPasteEditProvider(selector, provider, {
        providedPasteEditKinds: [provider.kind],
        pasteMimeTypes: [
            shared_1.Mimes.uriList,
            'files'
        ]
    }));
}
//# sourceMappingURL=dropOrPasteResource.js.map