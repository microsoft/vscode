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
exports.TypeScriptBaseCodeLensProvider = exports.ReferencesCodeLens = void 0;
exports.getSymbolRange = getSymbolRange;
const vscode = __importStar(require("vscode"));
const typeConverters = __importStar(require("../../typeConverters"));
const regexp_1 = require("../../utils/regexp");
const dispose_1 = require("../../utils/dispose");
class ReferencesCodeLens extends vscode.CodeLens {
    document;
    file;
    constructor(document, file, range) {
        super(range);
        this.document = document;
        this.file = file;
    }
}
exports.ReferencesCodeLens = ReferencesCodeLens;
class TypeScriptBaseCodeLensProvider extends dispose_1.Disposable {
    client;
    cachedResponse;
    changeEmitter = this._register(new vscode.EventEmitter());
    onDidChangeCodeLenses = this.changeEmitter.event;
    static cancelledCommand = {
        // Cancellation is not an error. Just show nothing until we can properly re-compute the code lens
        title: '',
        command: ''
    };
    static errorCommand = {
        title: vscode.l10n.t("Could not determine references"),
        command: ''
    };
    constructor(client, cachedResponse) {
        super();
        this.client = client;
        this.cachedResponse = cachedResponse;
    }
    async provideCodeLenses(document, token) {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return [];
        }
        const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', { file: filepath }, token));
        if (response.type !== 'response') {
            return [];
        }
        const referenceableSpans = [];
        response.body?.childItems?.forEach(item => this.walkNavTree(document, item, undefined, referenceableSpans));
        return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
    }
    walkNavTree(document, item, parent, results) {
        const range = this.extractSymbol(document, item, parent);
        if (range) {
            results.push(range);
        }
        item.childItems?.forEach(child => this.walkNavTree(document, child, item, results));
    }
}
exports.TypeScriptBaseCodeLensProvider = TypeScriptBaseCodeLensProvider;
function getSymbolRange(document, item) {
    if (item.nameSpan) {
        return typeConverters.Range.fromTextSpan(item.nameSpan);
    }
    // In older versions, we have to calculate this manually. See #23924
    const span = item.spans?.[0];
    if (!span) {
        return undefined;
    }
    const range = typeConverters.Range.fromTextSpan(span);
    const text = document.getText(range);
    const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${(0, regexp_1.escapeRegExp)(item.text || '')}(\\b|\\W)`, 'gm');
    const match = identifierMatch.exec(text);
    const prefixLength = match ? match.index + match[1].length : 0;
    const startOffset = document.offsetAt(new vscode.Position(range.start.line, range.start.character)) + prefixLength;
    return new vscode.Range(document.positionAt(startOffset), document.positionAt(startOffset + item.text.length));
}
//# sourceMappingURL=baseCodeLensProvider.js.map