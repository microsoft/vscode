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
exports.registerResourceDropOrPasteSupport = registerResourceDropOrPasteSupport;
const vscode = __importStar(require("vscode"));
const arrays_1 = require("../../util/arrays");
const document_1 = require("../../util/document");
const mimes_1 = require("../../util/mimes");
const schemes_1 = require("../../util/schemes");
const uriList_1 = require("../../util/uriList");
const newFilePathGenerator_1 = require("./newFilePathGenerator");
const shared_1 = require("./shared");
const smartDropOrPaste_1 = require("./smartDropOrPaste");
var CopyFilesSettings;
(function (CopyFilesSettings) {
    CopyFilesSettings["Never"] = "never";
    CopyFilesSettings["MediaFiles"] = "mediaFiles";
})(CopyFilesSettings || (CopyFilesSettings = {}));
/**
 * Provides support for pasting or dropping resources into markdown documents.
 *
 * This includes:
 *
 * - `text/uri-list` data in the data transfer.
 * - File object in the data transfer.
 * - Media data in the data transfer, such as `image/png`.
 */
class ResourcePasteOrDropProvider {
    static mimeTypes = [
        mimes_1.Mime.textUriList,
        'files',
        ...Object.values(mimes_1.rootMediaMimesTypes).map(type => `${type}/*`),
    ];
    #yieldTo = [
        vscode.DocumentDropOrPasteEditKind.Text,
        vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'link', 'image', 'attachment'), // Prefer notebook attachments
    ];
    #parser;
    constructor(parser) {
        this.#parser = parser;
    }
    async provideDocumentDropEdits(document, position, dataTransfer, token) {
        const edit = await this.#createEdit(document, [new vscode.Range(position, position)], dataTransfer, {
            insert: this.#getEnabled(document, 'editor.drop.enabled'),
            copyIntoWorkspace: vscode.workspace.getConfiguration('markdown', document).get('editor.drop.copyIntoWorkspace', CopyFilesSettings.MediaFiles)
        }, undefined, token);
        if (!edit || token.isCancellationRequested) {
            return;
        }
        const dropEdit = new vscode.DocumentDropEdit(edit.snippet);
        dropEdit.title = edit.label;
        dropEdit.kind = edit.kind;
        dropEdit.additionalEdit = edit.additionalEdits;
        dropEdit.yieldTo = [...this.#yieldTo, ...edit.yieldTo];
        return dropEdit;
    }
    async provideDocumentPasteEdits(document, ranges, dataTransfer, context, token) {
        const edit = await this.#createEdit(document, ranges, dataTransfer, {
            insert: this.#getEnabled(document, 'editor.paste.enabled'),
            copyIntoWorkspace: vscode.workspace.getConfiguration('markdown', document).get('editor.paste.copyIntoWorkspace', CopyFilesSettings.MediaFiles)
        }, context, token);
        if (!edit || token.isCancellationRequested) {
            return;
        }
        const pasteEdit = new vscode.DocumentPasteEdit(edit.snippet, edit.label, edit.kind);
        pasteEdit.additionalEdit = edit.additionalEdits;
        pasteEdit.yieldTo = [...this.#yieldTo, ...edit.yieldTo];
        return [pasteEdit];
    }
    #getEnabled(document, settingName) {
        const setting = vscode.workspace.getConfiguration('markdown', document).get(settingName, true);
        // Convert old boolean values to new enum setting
        if (setting === false) {
            return smartDropOrPaste_1.InsertMarkdownLink.Never;
        }
        else if (setting === true) {
            return smartDropOrPaste_1.InsertMarkdownLink.Smart;
        }
        else {
            return setting;
        }
    }
    async #createEdit(document, ranges, dataTransfer, settings, context, token) {
        if (settings.insert === smartDropOrPaste_1.InsertMarkdownLink.Never) {
            return;
        }
        let edit = await this.#createEditForMediaFiles(document, dataTransfer, settings.copyIntoWorkspace, token);
        if (token.isCancellationRequested) {
            return;
        }
        if (!edit) {
            edit = await this.#createEditFromUriListData(document, ranges, dataTransfer, context, token);
        }
        if (!edit || token.isCancellationRequested) {
            return;
        }
        if (!(await (0, smartDropOrPaste_1.shouldInsertMarkdownLinkByDefault)(this.#parser, document, settings.insert, ranges, token))) {
            edit.yieldTo.push(vscode.DocumentDropOrPasteEditKind.Empty.append('uri'));
        }
        return edit;
    }
    async #createEditFromUriListData(document, ranges, dataTransfer, context, token) {
        const uriListData = await dataTransfer.get(mimes_1.Mime.textUriList)?.asString();
        if (!uriListData || token.isCancellationRequested) {
            return;
        }
        const uriList = uriList_1.UriList.from(uriListData);
        if (!uriList.entries.length) {
            return;
        }
        // In some browsers, copying from the address bar sets both text/uri-list and text/plain.
        // Disable ourselves if there's also a text entry with the same http(s) uri as our list,
        // unless we are explicitly requested.
        if (uriList.entries.length === 1
            && (uriList.entries[0].uri.scheme === schemes_1.Schemes.http || uriList.entries[0].uri.scheme === schemes_1.Schemes.https)
            && !context?.only?.contains(shared_1.baseLinkEditKind)) {
            const text = await dataTransfer.get(mimes_1.Mime.textPlain)?.asString();
            if (token.isCancellationRequested) {
                return;
            }
            if (text && textMatchesUriList(text, uriList)) {
                return;
            }
        }
        const edit = (0, shared_1.createInsertUriListEdit)(document, ranges, uriList, { linkKindHint: context?.only });
        if (!edit) {
            return;
        }
        const additionalEdits = new vscode.WorkspaceEdit();
        additionalEdits.set(document.uri, edit.edits);
        return {
            label: edit.label,
            kind: edit.kind,
            snippet: new vscode.SnippetString(''),
            additionalEdits,
            yieldTo: []
        };
    }
    /**
     * Create a new edit for media files in a data transfer.
     *
     * This tries copying files outside of the workspace into the workspace.
     */
    async #createEditForMediaFiles(document, dataTransfer, copyIntoWorkspace, token) {
        if (copyIntoWorkspace !== CopyFilesSettings.MediaFiles || (0, document_1.getParentDocumentUri)(document.uri).scheme === schemes_1.Schemes.untitled) {
            return;
        }
        const pathGenerator = new newFilePathGenerator_1.NewFilePathGenerator();
        const fileEntries = (0, arrays_1.coalesce)(await Promise.all(Array.from(dataTransfer, async ([mime, item]) => {
            const mediaKind = (0, mimes_1.getMediaKindForMime)(mime);
            if (!mediaKind) {
                return;
            }
            const file = item?.asFile();
            if (!file) {
                return;
            }
            if (file.uri) {
                // If the file is already in a workspace, we don't want to create a copy of it
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
                if (workspaceFolder) {
                    return { uri: file.uri, kind: mediaKind };
                }
            }
            const newFile = await pathGenerator.getNewFilePath(document, file, token);
            if (!newFile) {
                return;
            }
            return { uri: newFile.uri, kind: mediaKind, newFile: { contents: file, overwrite: newFile.overwrite } };
        })));
        if (!fileEntries.length) {
            return;
        }
        const snippet = (0, shared_1.createUriListSnippet)(document.uri, fileEntries);
        if (!snippet) {
            return;
        }
        const additionalEdits = new vscode.WorkspaceEdit();
        for (const entry of fileEntries) {
            if (entry.newFile) {
                additionalEdits.createFile(entry.uri, {
                    contents: entry.newFile.contents,
                    overwrite: entry.newFile.overwrite,
                });
            }
        }
        const { label, kind } = (0, shared_1.getSnippetLabelAndKind)(snippet);
        return {
            snippet: snippet.snippet,
            label,
            kind,
            additionalEdits,
            yieldTo: [],
        };
    }
}
function textMatchesUriList(text, uriList) {
    if (text === uriList.entries[0].str) {
        return true;
    }
    try {
        const uri = vscode.Uri.parse(text);
        return uriList.entries.some(entry => entry.uri.toString() === uri.toString());
    }
    catch {
        return false;
    }
}
function registerResourceDropOrPasteSupport(selector, parser) {
    const providedEditKinds = [
        shared_1.baseLinkEditKind,
        shared_1.linkEditKind,
        shared_1.imageEditKind,
        shared_1.audioEditKind,
        shared_1.videoEditKind,
    ];
    return vscode.Disposable.from(vscode.languages.registerDocumentPasteEditProvider(selector, new ResourcePasteOrDropProvider(parser), {
        providedPasteEditKinds: providedEditKinds,
        pasteMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
    }), vscode.languages.registerDocumentDropEditProvider(selector, new ResourcePasteOrDropProvider(parser), {
        providedDropEditKinds: providedEditKinds,
        dropMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
    }));
}
//# sourceMappingURL=dropOrPasteResource.js.map