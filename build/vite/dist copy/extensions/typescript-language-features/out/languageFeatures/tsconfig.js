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
const jsonc = __importStar(require("jsonc-parser"));
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
const vscode_uri_1 = require("vscode-uri");
const arrays_1 = require("../utils/arrays");
const fs_1 = require("../utils/fs");
function mapChildren(node, f) {
    return node && node.type === 'array' && node.children
        ? node.children.map(f)
        : [];
}
const openExtendsLinkCommandId = '_typescript.openExtendsLink';
var TsConfigLinkType;
(function (TsConfigLinkType) {
    TsConfigLinkType[TsConfigLinkType["Extends"] = 0] = "Extends";
    TsConfigLinkType[TsConfigLinkType["References"] = 1] = "References";
})(TsConfigLinkType || (TsConfigLinkType = {}));
class TsconfigLinkProvider {
    provideDocumentLinks(document, _token) {
        const root = jsonc.parseTree(document.getText());
        if (!root) {
            return [];
        }
        return (0, arrays_1.coalesce)([
            this.getExtendsLink(document, root),
            ...this.getFilesLinks(document, root),
            ...this.getReferencesLinks(document, root)
        ]);
    }
    getExtendsLink(document, root) {
        const node = jsonc.findNodeAtLocation(root, ['extends']);
        return node && this.tryCreateTsConfigLink(document, node, TsConfigLinkType.Extends);
    }
    getReferencesLinks(document, root) {
        return mapChildren(jsonc.findNodeAtLocation(root, ['references']), child => {
            const pathNode = jsonc.findNodeAtLocation(child, ['path']);
            return pathNode && this.tryCreateTsConfigLink(document, pathNode, TsConfigLinkType.References);
        });
    }
    tryCreateTsConfigLink(document, node, linkType) {
        if (!this.isPathValue(node)) {
            return undefined;
        }
        const args = {
            resourceUri: { ...document.uri.toJSON(), $mid: undefined },
            extendsValue: node.value,
            linkType
        };
        const link = new vscode.DocumentLink(this.getRange(document, node), vscode.Uri.parse(`command:${openExtendsLinkCommandId}?${JSON.stringify(args)}`));
        link.tooltip = vscode.l10n.t("Follow link");
        return link;
    }
    getFilesLinks(document, root) {
        return mapChildren(jsonc.findNodeAtLocation(root, ['files']), child => this.pathNodeToLink(document, child));
    }
    pathNodeToLink(document, node) {
        return this.isPathValue(node)
            ? new vscode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
            : undefined;
    }
    isPathValue(node) {
        return node
            && node.type === 'string'
            && node.value
            && !node.value.includes('*'); // don't treat globs as links.
    }
    getFileTarget(document, node) {
        if ((0, path_1.isAbsolute)(node.value)) {
            return vscode.Uri.file(node.value);
        }
        return vscode.Uri.joinPath(vscode_uri_1.Utils.dirname(document.uri), node.value);
    }
    getRange(document, node) {
        const offset = node.offset;
        const start = document.positionAt(offset + 1);
        const end = document.positionAt(offset + (node.length - 1));
        return new vscode.Range(start, end);
    }
}
async function resolveNodeModulesPath(baseDirUri, pathCandidates) {
    let currentUri = baseDirUri;
    const baseCandidate = pathCandidates[0];
    const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
    const moduleBasePath = baseCandidate.split(path_1.posix.sep).slice(0, sepIndex).join(path_1.posix.sep);
    while (true) {
        const moduleAbsoluteUrl = vscode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
        let moduleStat;
        try {
            moduleStat = await vscode.workspace.fs.stat(moduleAbsoluteUrl);
        }
        catch (err) {
            // noop
        }
        if (moduleStat && (moduleStat.type & vscode.FileType.Directory)) {
            for (const uriCandidate of pathCandidates
                .map((relativePath) => relativePath.split(path_1.posix.sep).slice(sepIndex).join(path_1.posix.sep))
                // skip empty paths within module
                .filter(Boolean)
                .map((relativeModulePath) => vscode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))) {
                if (await (0, fs_1.exists)(uriCandidate)) {
                    return uriCandidate;
                }
            }
            // Continue to looking for potentially another version
        }
        const oldUri = currentUri;
        currentUri = vscode.Uri.joinPath(currentUri, '..');
        // Can't go next. Reached the system root
        if (oldUri.path === currentUri.path) {
            return;
        }
    }
}
// Reference Extends:https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
// Reference Project References: https://github.com/microsoft/TypeScript/blob/7377f5cb9db19d79a6167065b323a45611c812b5/src/compiler/tsbuild.ts#L188C1-L194C2
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri, pathValue, linkType) {
    async function resolve(absolutePath) {
        if (absolutePath.path.endsWith('.json') || await (0, fs_1.exists)(absolutePath)) {
            return absolutePath;
        }
        return absolutePath.with({
            path: `${absolutePath.path}${linkType === TsConfigLinkType.References ? '/tsconfig.json' : '.json'}`
        });
    }
    const isRelativePath = ['./', '../'].some(str => pathValue.startsWith(str));
    if (isRelativePath) {
        return resolve(vscode.Uri.joinPath(baseDirUri, pathValue));
    }
    if (pathValue.startsWith('/') || (0, fs_1.looksLikeAbsoluteWindowsPath)(pathValue)) {
        return resolve(vscode.Uri.file(pathValue));
    }
    // Otherwise resolve like a module
    return resolveNodeModulesPath(baseDirUri, [
        pathValue,
        ...pathValue.endsWith('.json') ? [] : [
            `${pathValue}.json`,
            `${pathValue}/tsconfig.json`,
        ]
    ]);
}
function register() {
    const patterns = [
        '**/[jt]sconfig.json',
        '**/[jt]sconfig.*.json',
    ];
    const languages = ['json', 'jsonc'];
    const selector = languages.map(language => patterns.map((pattern) => ({ language, pattern })))
        .flat();
    return vscode.Disposable.from(vscode.commands.registerCommand(openExtendsLinkCommandId, async ({ resourceUri, extendsValue, linkType }) => {
        const tsconfigPath = await getTsconfigPath(vscode_uri_1.Utils.dirname(vscode.Uri.from(resourceUri)), extendsValue, linkType);
        if (tsconfigPath === undefined) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve {0} as module", extendsValue));
            return;
        }
        // Will suggest to create a .json variant if it doesn't exist yet (but only for relative paths)
        await vscode.commands.executeCommand('vscode.open', tsconfigPath);
    }), vscode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider()));
}
//# sourceMappingURL=tsconfig.js.map