/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
export var OmittedState;
(function (OmittedState) {
    OmittedState[OmittedState["NotOmitted"] = 0] = "NotOmitted";
    OmittedState[OmittedState["Partial"] = 1] = "Partial";
    OmittedState[OmittedState["Full"] = 2] = "Full";
    OmittedState[OmittedState["ImageLimitExceeded"] = 3] = "ImageLimitExceeded";
})(OmittedState || (OmittedState = {}));
/**
 * The maximum number of images allowed per request.
 * Claude has an upstream limit where more than 20 images causes issues.
 */
export const MAX_IMAGES_PER_REQUEST = 20;
export var IDiagnosticVariableEntryFilterData;
(function (IDiagnosticVariableEntryFilterData) {
    IDiagnosticVariableEntryFilterData.icon = Codicon.error;
    function fromMarker(marker) {
        return {
            filterUri: marker.resource,
            owner: marker.owner,
            problemMessage: marker.message,
            filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
        };
    }
    IDiagnosticVariableEntryFilterData.fromMarker = fromMarker;
    function toEntry(data) {
        return {
            id: id(data),
            name: label(data),
            icon: IDiagnosticVariableEntryFilterData.icon,
            value: data,
            kind: 'diagnostic',
            ...data,
        };
    }
    IDiagnosticVariableEntryFilterData.toEntry = toEntry;
    function id(data) {
        return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber, data.filterRange?.startColumn].join(':');
    }
    IDiagnosticVariableEntryFilterData.id = id;
    function label(data) {
        let TrimThreshold;
        (function (TrimThreshold) {
            TrimThreshold[TrimThreshold["MaxChars"] = 30] = "MaxChars";
            TrimThreshold[TrimThreshold["MaxSpaceLookback"] = 10] = "MaxSpaceLookback";
        })(TrimThreshold || (TrimThreshold = {}));
        if (data.problemMessage) {
            if (data.problemMessage.length < 30 /* TrimThreshold.MaxChars */) {
                return data.problemMessage;
            }
            // Trim the message, on a space if it would not lose too much
            // data (MaxSpaceLookback) or just blindly otherwise.
            const lastSpace = data.problemMessage.lastIndexOf(' ', 30 /* TrimThreshold.MaxChars */);
            if (lastSpace === -1 || lastSpace + 10 /* TrimThreshold.MaxSpaceLookback */ < 30 /* TrimThreshold.MaxChars */) {
                return data.problemMessage.substring(0, 30 /* TrimThreshold.MaxChars */) + '…';
            }
            return data.problemMessage.substring(0, lastSpace) + '…';
        }
        let labelStr = localize('chat.attachment.problems.all', "All Problems");
        if (data.filterUri) {
            labelStr = localize('chat.attachment.problems.inFile', "Problems in {0}", basename(data.filterUri));
        }
        return labelStr;
    }
    IDiagnosticVariableEntryFilterData.label = label;
})(IDiagnosticVariableEntryFilterData || (IDiagnosticVariableEntryFilterData = {}));
export var IChatRequestVariableEntry;
(function (IChatRequestVariableEntry) {
    /**
     * Returns URI of the passed variant entry. Return undefined if not found.
     */
    function toUri(entry) {
        return URI.isUri(entry.value)
            ? entry.value
            : isLocation(entry.value)
                ? entry.value.uri
                : undefined;
    }
    IChatRequestVariableEntry.toUri = toUri;
    function toExport(v) {
        if (v.value instanceof Uint8Array) {
            // 'dup' here is needed otherwise TS complains about the narrowed `value` in a spread operation
            const dup = { ...v };
            dup.value = { $base64: encodeBase64(VSBuffer.wrap(v.value)) };
            return dup;
        }
        return v;
    }
    IChatRequestVariableEntry.toExport = toExport;
    function fromExport(v) {
        // Old variables format
        // eslint-disable-next-line local/code-no-in-operator
        if (v && 'values' in v && Array.isArray(v.values)) {
            return {
                kind: 'generic',
                id: v.id ?? '',
                name: v.name,
                value: v.values[0]?.value,
                range: v.range,
                modelDescription: v.modelDescription,
                references: v.references
            };
        }
        else {
            // eslint-disable-next-line local/code-no-in-operator
            if (v.value && typeof v.value === 'object' && '$base64' in v.value && typeof v.value.$base64 === 'string') {
                // 'dup' here is needed otherwise TS complains about the narrowed `value` in a spread operation
                const dup = { ...v };
                dup.value = decodeBase64(v.value.$base64).buffer;
                return dup;
            }
            return v;
        }
    }
    IChatRequestVariableEntry.fromExport = fromExport;
})(IChatRequestVariableEntry || (IChatRequestVariableEntry = {}));
export function isImplicitVariableEntry(obj) {
    return obj.kind === 'implicit';
}
export function isStringVariableEntry(obj) {
    return obj.kind === 'string';
}
export function isTerminalVariableEntry(obj) {
    return obj.kind === 'terminalCommand';
}
export function isDebugVariableEntry(obj) {
    return obj.kind === 'debugVariable';
}
export function isAgentFeedbackVariableEntry(obj) {
    return obj.kind === 'agentFeedback';
}
export function isPasteVariableEntry(obj) {
    return obj.kind === 'paste';
}
export function isWorkspaceVariableEntry(obj) {
    return obj.kind === 'workspace';
}
export function isImageVariableEntry(obj) {
    return obj.kind === 'image';
}
export function isNotebookOutputVariableEntry(obj) {
    return obj.kind === 'notebookOutput';
}
export function isElementVariableEntry(obj) {
    return obj.kind === 'element';
}
export function isDiagnosticsVariableEntry(obj) {
    return obj.kind === 'diagnostic';
}
export function isChatRequestFileEntry(obj) {
    return obj.kind === 'file';
}
export function isPromptFileVariableEntry(obj) {
    return obj.kind === 'promptFile';
}
export function isPromptTextVariableEntry(obj) {
    return obj.kind === 'promptText';
}
export function isChatRequestVariableEntry(obj) {
    const entry = obj;
    return typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string';
}
export function isSCMHistoryItemVariableEntry(obj) {
    return obj.kind === 'scmHistoryItem';
}
export function isSCMHistoryItemChangeVariableEntry(obj) {
    return obj.kind === 'scmHistoryItemChange';
}
export function isSCMHistoryItemChangeRangeVariableEntry(obj) {
    return obj.kind === 'scmHistoryItemChangeRange';
}
export function isStringImplicitContextValue(value) {
    const asStringImplicitContextValue = value;
    return (typeof asStringImplicitContextValue === 'object' &&
        asStringImplicitContextValue !== null &&
        (typeof asStringImplicitContextValue.value === 'string' || typeof asStringImplicitContextValue.value === 'undefined') &&
        (typeof asStringImplicitContextValue.name === 'string' || typeof asStringImplicitContextValue.name === 'undefined') &&
        (asStringImplicitContextValue.resourceUri === undefined || URI.isUri(asStringImplicitContextValue.resourceUri)) &&
        (typeof asStringImplicitContextValue.name === 'string' || URI.isUri(asStringImplicitContextValue.resourceUri)) &&
        (asStringImplicitContextValue.icon === undefined || ThemeIcon.isThemeIcon(asStringImplicitContextValue.icon)) &&
        URI.isUri(asStringImplicitContextValue.uri) &&
        typeof asStringImplicitContextValue.handle === 'number');
}
export var PromptFileVariableKind;
(function (PromptFileVariableKind) {
    PromptFileVariableKind["Instruction"] = "vscode.instructions.file.root";
    PromptFileVariableKind["InstructionReference"] = "vscode.instructions.file.reference";
    PromptFileVariableKind["PromptFile"] = "vscode.prompt.file";
})(PromptFileVariableKind || (PromptFileVariableKind = {}));
/**
 * Utility to convert a {@link uri} to a chat variable entry.
 * The `id` of the chat variable can be one of the following:
 *
 * - `vscode.instructions.file.reference__<URI>`: for all non-root prompt instructions references
 * - `vscode.instructions.file.root__<URI>`: for *root* prompt instructions references
 * - `vscode.prompt.file__<URI>`: for prompt file references
 *
 * @param uri A resource URI that points to a prompt instructions file.
 * @param kind The kind of the prompt file variable entry.
 */
export function toPromptFileVariableEntry(uri, kind, originLabel, automaticallyAdded = false, toolReferences) {
    //  `id` for all `prompt files` starts with the well-defined part that the copilot extension(or other chatbot) can rely on
    return {
        id: `${kind}__${uri.toString()}`,
        name: `prompt:${basename(uri)}`,
        value: uri,
        kind: 'promptFile',
        modelDescription: 'Prompt instructions file',
        isRoot: kind !== PromptFileVariableKind.InstructionReference,
        originLabel,
        toolReferences,
        automaticallyAdded
    };
}
var PromptTextVariableKind;
(function (PromptTextVariableKind) {
    PromptTextVariableKind["CustomizationsIndex"] = "vscode.customizations.index";
})(PromptTextVariableKind || (PromptTextVariableKind = {}));
export function toPromptTextVariableEntry(content, automaticallyAdded = false, toolReferences) {
    return {
        id: PromptTextVariableKind.CustomizationsIndex,
        name: `prompt:customizationsIndex`,
        value: content,
        kind: 'promptText',
        modelDescription: 'Chat customizations index',
        automaticallyAdded,
        toolReferences
    };
}
export function toFileVariableEntry(uri, range) {
    return {
        kind: 'file',
        value: range ? { uri, range } : uri,
        id: uri.toString() + (range?.toString() ?? ''),
        name: basename(uri),
    };
}
export function toToolVariableEntry(entry, range) {
    return {
        kind: 'tool',
        id: entry.id,
        icon: ThemeIcon.isThemeIcon(entry.icon) ? entry.icon : undefined,
        name: entry.displayName,
        value: undefined,
        range
    };
}
export function toToolSetVariableEntry(entry, range) {
    return {
        kind: 'toolset',
        id: entry.id,
        icon: entry.icon,
        name: entry.referenceName,
        value: Array.from(entry.getTools()).map(t => toToolVariableEntry(t)),
        range
    };
}
export class ChatRequestVariableSet {
    constructor(entries) {
        this._ids = new Set();
        this._entries = [];
        if (entries) {
            this.add(...entries);
        }
    }
    add(...entry) {
        for (const e of entry) {
            if (!this._ids.has(e.id)) {
                this._ids.add(e.id);
                this._entries.push(e);
            }
        }
    }
    insertFirst(entry) {
        if (!this._ids.has(entry.id)) {
            this._ids.add(entry.id);
            this._entries.unshift(entry);
        }
    }
    remove(entry) {
        this._ids.delete(entry.id);
        this._entries = this._entries.filter(e => e.id !== entry.id);
    }
    has(entry) {
        return this._ids.has(entry.id);
    }
    asArray() {
        return this._entries.slice(0); // return a copy
    }
    get length() {
        return this._entries.length;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZhcmlhYmxlRW50cmllcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBR3hELE9BQU8sRUFBRSxVQUFVLEVBQXdCLE1BQU0sMkNBQTJDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBTWpELE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBbUM1RixNQUFNLENBQU4sSUFBa0IsWUFLakI7QUFMRCxXQUFrQixZQUFZO0lBQzdCLDJEQUFVLENBQUE7SUFDVixxREFBTyxDQUFBO0lBQ1AsK0NBQUksQ0FBQTtJQUNKLDJFQUFrQixDQUFBO0FBQ25CLENBQUMsRUFMaUIsWUFBWSxLQUFaLFlBQVksUUFLN0I7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxFQUFFLENBQUM7QUE0R3pDLE1BQU0sS0FBVyxrQ0FBa0MsQ0FvRGxEO0FBcERELFdBQWlCLGtDQUFrQztJQUNyQyx1Q0FBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFFbEMsU0FBZ0IsVUFBVSxDQUFDLE1BQWU7UUFDekMsT0FBTztZQUNOLFNBQVMsRUFBRSxNQUFNLENBQUMsUUFBUTtZ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