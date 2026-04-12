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
exports.MdLinkOpener = void 0;
const vscode = __importStar(require("vscode"));
var OpenMarkdownLinks;
(function (OpenMarkdownLinks) {
    OpenMarkdownLinks["beside"] = "beside";
    OpenMarkdownLinks["currentGroup"] = "currentGroup";
})(OpenMarkdownLinks || (OpenMarkdownLinks = {}));
class MdLinkOpener {
    #client;
    constructor(client) {
        this.#client = client;
    }
    async resolveDocumentLink(linkText, fromResource) {
        return this.#client.resolveLinkTarget(linkText, fromResource);
    }
    async openDocumentLink(linkText, fromResource, viewColumn) {
        const resolved = await this.#client.resolveLinkTarget(linkText, fromResource);
        if (!resolved) {
            return;
        }
        let uri = vscode.Uri.from(resolved.uri);
        let rangeSelection;
        if (resolved.kind === 'file' && !resolved.position) {
            if (uri.fragment) {
                rangeSelection = getSelectionFromLocationFragment(uri.fragment);
            }
            else {
                const locationFragment = getLocationFragmentFromLinkText(linkText);
                if (locationFragment) {
                    uri = uri.with({ fragment: locationFragment });
                    rangeSelection = getSelectionFromLocationFragment(locationFragment);
                }
            }
        }
        switch (resolved.kind) {
            case 'external':
                return vscode.commands.executeCommand('vscode.open', uri);
            case 'folder':
                return vscode.commands.executeCommand('revealInExplorer', uri);
            case 'file': {
                // If no explicit viewColumn is given, check if the editor is already open in a tab
                if (typeof viewColumn === 'undefined') {
                    for (const tab of vscode.window.tabGroups.all.flatMap(x => x.tabs)) {
                        if (tab.input instanceof vscode.TabInputText) {
                            if (tab.input.uri.fsPath === uri.fsPath) {
                                viewColumn = tab.group.viewColumn;
                                break;
                            }
                        }
                    }
                }
                return vscode.commands.executeCommand('vscode.open', uri, {
                    selection: resolved.position
                        ? new vscode.Range(resolved.position.line, resolved.position.character, resolved.position.line, resolved.position.character)
                        : rangeSelection,
                    viewColumn: viewColumn ?? getViewColumn(fromResource),
                });
            }
        }
    }
}
exports.MdLinkOpener = MdLinkOpener;
function getSelectionFromLocationFragment(fragment) {
    const match = /^L?(\d+)(?:,(\d+))?(?:-L?(\d+)(?:,(\d+))?)?$/i.exec(fragment);
    if (!match) {
        return undefined;
    }
    const startLineNumber = parseInt(match[1], 10);
    if (isNaN(startLineNumber) || startLineNumber <= 0) {
        return undefined;
    }
    const startColumn = match[2] ? parseInt(match[2], 10) : 1;
    const endLineNumberRaw = match[3] ? parseInt(match[3], 10) : undefined;
    if (typeof endLineNumberRaw !== 'undefined' && endLineNumberRaw <= 0) {
        return undefined;
    }
    const endLineNumber = endLineNumberRaw;
    const endColumn = match[3] ? (match[4] ? parseInt(match[4], 10) : 1) : undefined;
    let normalizedStartLine = startLineNumber;
    let normalizedStartColumn = startColumn;
    let normalizedEndLine = endLineNumber;
    let normalizedEndColumn = endColumn ?? 1;
    if (typeof normalizedEndLine === 'number') {
        if (normalizedEndLine < normalizedStartLine || (normalizedEndLine === normalizedStartLine && normalizedEndColumn < normalizedStartColumn)) {
            const tmpLine = normalizedStartLine;
            const tmpColumn = normalizedStartColumn;
            normalizedStartLine = normalizedEndLine;
            normalizedStartColumn = normalizedEndColumn;
            normalizedEndLine = tmpLine;
            normalizedEndColumn = tmpColumn;
        }
    }
    const start = new vscode.Position(normalizedStartLine - 1, Math.max(0, normalizedStartColumn - 1));
    const end = typeof normalizedEndLine === 'number'
        ? new vscode.Position(normalizedEndLine - 1, Math.max(0, normalizedEndColumn - 1))
        : start;
    return new vscode.Range(start, end);
}
function getLocationFragmentFromLinkText(linkText) {
    const fragmentStart = linkText.indexOf('#');
    if (fragmentStart < 0) {
        return undefined;
    }
    let fragment;
    try {
        fragment = decodeURIComponent(linkText.slice(fragmentStart + 1));
    }
    catch {
        return undefined;
    }
    if (!fragment) {
        return undefined;
    }
    if (/^L?\d+(?:,\d+)?(?:-L?\d+(?:,\d+)?)?$/i.test(fragment)) {
        return fragment;
    }
    return undefined;
}
function getViewColumn(resource) {
    const config = vscode.workspace.getConfiguration('markdown', resource);
    const openLinks = config.get('links.openLocation', OpenMarkdownLinks.currentGroup);
    switch (openLinks) {
        case OpenMarkdownLinks.beside:
            return vscode.ViewColumn.Beside;
        case OpenMarkdownLinks.currentGroup:
        default:
            return vscode.ViewColumn.Active;
    }
}
//# sourceMappingURL=openDocumentLink.js.map