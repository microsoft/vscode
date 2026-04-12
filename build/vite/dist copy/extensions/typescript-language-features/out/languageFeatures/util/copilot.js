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
exports.CompositeCommand = exports.EditorChatFollowUp = void 0;
const vscode = __importStar(require("vscode"));
const cancellation_1 = require("../../utils/cancellation");
const typeConverters = __importStar(require("../../typeConverters"));
class EditorChatFollowUp {
    client;
    telemetryReporter;
    static ID = '_typescript.quickFix.editorChatReplacement2';
    id = EditorChatFollowUp.ID;
    constructor(client, telemetryReporter) {
        this.client = client;
        this.telemetryReporter = telemetryReporter;
    }
    async execute({ message, document, expand, action }) {
        if (action.type === 'quickfix') {
            /* __GDPR__
                "aiQuickfix.execute" : {
                    "owner": "mjbvz",
                    "action" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this.telemetryReporter.logTelemetry('aiQuickfix.execute', {
                action: action.quickfix.fixName,
            });
        }
        else {
            /* __GDPR__
                "aiRefactor.execute" : {
                    "owner": "mjbvz",
                    "action" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this.telemetryReporter.logTelemetry('aiRefactor.execute', {
                action: action.refactor.name,
            });
        }
        const initialRange = expand.kind === 'navtree-function'
            ? await findScopeEndLineFromNavTree(this.client, document, expand.pos.line)
            : expand.kind === 'refactor-info'
                ? await findEditScope(this.client, document, expand.refactor.edits.flatMap((e) => e.textChanges))
                : expand.kind === 'code-action'
                    ? await findEditScope(this.client, document, expand.action.changes.flatMap((c) => c.textChanges))
                    : expand.range;
        const initialSelection = initialRange ? new vscode.Selection(initialRange.start, initialRange.end) : undefined;
        await vscode.commands.executeCommand('vscode.editorChat.start', {
            initialRange,
            initialSelection,
            message,
            autoSend: true,
        });
    }
}
exports.EditorChatFollowUp = EditorChatFollowUp;
class CompositeCommand {
    static ID = '_typescript.compositeCommand';
    id = CompositeCommand.ID;
    async execute(...commands) {
        for (const command of commands) {
            await vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
        }
    }
}
exports.CompositeCommand = CompositeCommand;
function findScopeEndLineFromNavTreeWorker(startLine, navigationTree) {
    for (const node of navigationTree) {
        const range = typeConverters.Range.fromTextSpan(node.spans[0]);
        if (startLine === range.start.line) {
            return range;
        }
        else if (startLine > range.start.line &&
            startLine <= range.end.line &&
            node.childItems) {
            return findScopeEndLineFromNavTreeWorker(startLine, node.childItems);
        }
    }
    return undefined;
}
async function findScopeEndLineFromNavTree(client, document, startLine) {
    const filepath = client.toOpenTsFilePath(document);
    if (!filepath) {
        return;
    }
    const response = await client.execute('navtree', { file: filepath }, cancellation_1.nulToken);
    if (response.type !== 'response' || !response.body?.childItems) {
        return;
    }
    return findScopeEndLineFromNavTreeWorker(startLine, response.body.childItems);
}
async function findEditScope(client, document, edits) {
    let first = typeConverters.Position.fromLocation(edits[0].start);
    let firstEdit = edits[0];
    let lastEdit = edits[0];
    let last = typeConverters.Position.fromLocation(edits[0].start);
    for (const edit of edits) {
        const start = typeConverters.Position.fromLocation(edit.start);
        const end = typeConverters.Position.fromLocation(edit.end);
        if (start.compareTo(first) < 0) {
            first = start;
            firstEdit = edit;
        }
        if (end.compareTo(last) > 0) {
            last = end;
            lastEdit = edit;
        }
    }
    const text = document.getText();
    const startIndex = text.indexOf(firstEdit.newText);
    const start = startIndex > -1 ? document.positionAt(startIndex) : first;
    const endIndex = text.lastIndexOf(lastEdit.newText);
    const end = endIndex > -1
        ? document.positionAt(endIndex + lastEdit.newText.length)
        : last;
    const expandEnd = await findScopeEndLineFromNavTree(client, document, end.line);
    return new vscode.Range(start, expandEnd?.end ?? end);
}
//# sourceMappingURL=copilot.js.map