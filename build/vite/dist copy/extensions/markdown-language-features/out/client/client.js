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
exports.MdLanguageClient = void 0;
exports.startClient = startClient;
const vscode = __importStar(require("vscode"));
const vscode_languageclient_1 = require("vscode-languageclient");
const file_1 = require("../util/file");
const fileWatchingManager_1 = require("./fileWatchingManager");
const inMemoryDocument_1 = require("./inMemoryDocument");
const proto = __importStar(require("./protocol"));
const workspace_1 = require("./workspace");
class MdLanguageClient {
    #client;
    #workspace;
    constructor(client, workspace) {
        this.#client = client;
        this.#workspace = workspace;
    }
    dispose() {
        this.#client.stop();
        this.#workspace.dispose();
    }
    resolveLinkTarget(linkText, uri) {
        return this.#client.sendRequest(proto.resolveLinkTarget, { linkText, uri: uri.toString() });
    }
    getEditForFileRenames(files, token) {
        return this.#client.sendRequest(proto.getEditForFileRenames, files, token);
    }
    getReferencesToFileInWorkspace(resource, token) {
        return this.#client.sendRequest(proto.getReferencesToFileInWorkspace, { uri: resource.toString() }, token);
    }
    prepareUpdatePastedLinks(doc, ranges, token) {
        return this.#client.sendRequest(proto.prepareUpdatePastedLinks, {
            uri: doc.toString(),
            ranges: ranges.map(range => vscode_languageclient_1.Range.create(range.start.line, range.start.character, range.end.line, range.end.character)),
        }, token);
    }
    getUpdatePastedLinksEdit(pastingIntoDoc, edits, metadata, token) {
        return this.#client.sendRequest(proto.getUpdatePastedLinksEdit, {
            metadata,
            pasteIntoDoc: pastingIntoDoc.toString(),
            edits: edits.map(edit => vscode_languageclient_1.TextEdit.replace(edit.range, edit.newText)),
        }, token);
    }
}
exports.MdLanguageClient = MdLanguageClient;
async function startClient(factory, parser) {
    const mdFileGlob = `**/*.{${file_1.markdownFileExtensions.join(',')}}`;
    const clientOptions = {
        documentSelector: file_1.markdownLanguageIds,
        synchronize: {
            configurationSection: ['markdown'],
            fileEvents: vscode.workspace.createFileSystemWatcher(mdFileGlob),
        },
        initializationOptions: {
            markdownFileExtensions: file_1.markdownFileExtensions,
            i10lLocation: vscode.l10n.uri?.toJSON(),
        },
        diagnosticPullOptions: {
            onChange: true,
            onTabs: true,
            match(_documentSelector, resource) {
                return (0, file_1.looksLikeMarkdownPath)(resource);
            },
        },
        markdown: {
            supportHtml: true,
        }
    };
    const client = factory('markdown', vscode.l10n.t("Markdown Language Server"), clientOptions);
    client.registerProposedFeatures();
    const notebookFeature = client.getFeature(vscode_languageclient_1.NotebookDocumentSyncRegistrationType.method);
    if (notebookFeature !== undefined) {
        notebookFeature.register({
            id: String(Date.now()),
            registerOptions: {
                notebookSelector: [{
                        notebook: '*',
                        cells: [{ language: 'markdown' }]
                    }]
            }
        });
    }
    const workspace = new workspace_1.VsCodeMdWorkspace();
    client.onRequest(proto.parse, async (e) => {
        const uri = vscode.Uri.parse(e.uri);
        if (typeof e.text === 'string') {
            return parser.tokenize(new inMemoryDocument_1.InMemoryDocument(uri, e.text, -1));
        }
        else {
            const doc = await workspace.getOrLoadMarkdownDocument(uri);
            if (doc) {
                return parser.tokenize(doc);
            }
            else {
                return [];
            }
        }
    });
    client.onRequest(proto.fs_readFile, async (e) => {
        const uri = vscode.Uri.parse(e.uri);
        return Array.from(await vscode.workspace.fs.readFile(uri));
    });
    client.onRequest(proto.fs_stat, async (e) => {
        const uri = vscode.Uri.parse(e.uri);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return { isDirectory: stat.type === vscode.FileType.Directory };
        }
        catch {
            return undefined;
        }
    });
    client.onRequest(proto.fs_readDirectory, async (e) => {
        const uri = vscode.Uri.parse(e.uri);
        const result = await vscode.workspace.fs.readDirectory(uri);
        return result.map(([name, type]) => [name, { isDirectory: type === vscode.FileType.Directory }]);
    });
    client.onRequest(proto.findMarkdownFilesInWorkspace, async () => {
        return (await vscode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
    });
    const watchers = new fileWatchingManager_1.FileWatcherManager();
    client.onRequest(proto.fs_watcher_create, async (params) => {
        const id = params.id;
        const uri = vscode.Uri.parse(params.uri);
        const sendWatcherChange = (kind) => {
            client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind });
        };
        watchers.create(id, uri, params.watchParentDirs, {
            create: params.options.ignoreCreate ? undefined : () => sendWatcherChange('create'),
            change: params.options.ignoreChange ? undefined : () => sendWatcherChange('change'),
            delete: params.options.ignoreDelete ? undefined : () => sendWatcherChange('delete'),
        });
    });
    client.onRequest(proto.fs_watcher_delete, async (params) => {
        watchers.delete(params.id);
    });
    vscode.commands.registerCommand('vscodeMarkdownLanguageservice.open', (uri, args) => {
        return vscode.commands.executeCommand('vscode.open', uri, args);
    });
    vscode.commands.registerCommand('vscodeMarkdownLanguageservice.rename', (uri, pos) => {
        return vscode.commands.executeCommand('editor.action.rename', [vscode.Uri.from(uri), new vscode.Position(pos.line, pos.character)]);
    });
    await client.start();
    return new MdLanguageClient(client, workspace);
}
//# sourceMappingURL=client.js.map