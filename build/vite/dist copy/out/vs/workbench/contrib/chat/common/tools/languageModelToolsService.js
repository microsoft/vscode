/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, ObservableSet } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { stringifyPromptElementJSON } from './promptTsxTypes.js';
/**
 * Check if a tool matches the given model metadata based on the tool's `models` selectors.
 * If the tool has no `models` defined, it matches all models.
 * If model is undefined, model-specific filtering is skipped (tool is included).
 */
export function toolMatchesModel(toolData, model) {
    // If no model selectors are defined, the tool is available for all models
    if (!toolData.models || toolData.models.length === 0) {
        return true;
    }
    // If model is undefined, skip model-specific filtering
    if (!model) {
        return true;
    }
    // Check if any selector matches the model (OR logic)
    return toolData.models.some(selector => (!selector.id || selector.id === model.id) &&
        (!selector.vendor || selector.vendor === model.vendor) &&
        (!selector.family || selector.family === model.family) &&
        (!selector.version || selector.version === model.version));
}
export var ToolDataSource;
(function (ToolDataSource) {
    ToolDataSource.Internal = { type: 'internal', label: 'Built-In' };
    /** External tools may not be contributed or invoked, but may be invoked externally and described in an IChatToolInvocationSerialized */
    ToolDataSource.External = { type: 'external', label: 'External' };
    function toKey(source) {
        switch (source.type) {
            case 'extension': return `extension:${source.extensionId.value}`;
            case 'mcp': return `mcp:${source.collectionId}:${source.definitionId}`;
            case 'user': return `user:${source.file.toString()}`;
            case 'internal': return 'internal';
            case 'external': return 'external';
        }
    }
    ToolDataSource.toKey = toKey;
    function equals(a, b) {
        return toKey(a) === toKey(b);
    }
    ToolDataSource.equals = equals;
    function classify(source) {
        if (source.type === 'internal') {
            return { ordinal: 1, label: localize('builtin', 'Built-In') };
        }
        else if (source.type === 'mcp') {
            return { ordinal: 2, label: source.label };
        }
        else if (source.type === 'user') {
            return { ordinal: 0, label: localize('user', 'User Defined') };
        }
        else {
            return { ordinal: 3, label: source.label };
        }
    }
    ToolDataSource.classify = classify;
})(ToolDataSource || (ToolDataSource = {}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isToolInvocationContext(obj) {
    return obj !== null && typeof obj === 'object' && URI.isUri(obj.sessionResource);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isToolResultInputOutputDetails(obj) {
    return typeof obj === 'object' && typeof obj?.input === 'string' && (typeof obj?.output === 'string' || Array.isArray(obj?.output));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isToolResultOutputDetails(obj) {
    return typeof obj === 'object' && typeof obj?.output === 'object' && typeof obj?.output?.mimeType === 'string' && obj?.output?.type === 'data';
}
export function toolContentToA11yString(part) {
    return part.map(p => {
        switch (p.kind) {
            case 'promptTsx':
                return stringifyPromptTsxPart(p);
            case 'text':
                return p.value;
            case 'data':
                return localize('toolResultDataPartA11y', "{0} of {1} binary data", ByteSize.formatSize(p.value.data.byteLength), p.value.mimeType || 'unknown');
        }
    }).join(', ');
}
export function toolResultHasBuffers(result) {
    return result.content.some(part => part.kind === 'data');
}
export function stringifyPromptTsxPart(part) {
    return stringifyPromptElementJSON(part.value);
}
export var ToolInvocationPresentation;
(function (ToolInvocationPresentation) {
    ToolInvocationPresentation["Hidden"] = "hidden";
    ToolInvocationPresentation["HiddenAfterComplete"] = "hiddenAfterComplete";
})(ToolInvocationPresentation || (ToolInvocationPresentation = {}));
export function isToolSet(obj) {
    return !!obj && obj.getTools !== undefined;
}
export class ToolSet {
    constructor(id, referenceName, icon, source, description, legacyFullNames, _contextKeyService) {
        this.id = id;
        this.referenceName = referenceName;
        this.icon = icon;
        this.source = source;
        this.description = description;
        this.legacyFullNames = legacyFullNames;
        this._contextKeyService = _contextKeyService;
        this._tools = new ObservableSet();
        this._toolSets = new ObservableSet();
        this.isHomogenous = derived(r => {
            return !Iterable.some(this._tools.observable.read(r), tool => !ToolDataSource.equals(tool.source, this.source))
                && !Iterable.some(this._toolSets.observable.read(r), toolSet => !ToolDataSource.equals(toolSet.source, this.source));
        });
    }
    addTool(data, tx) {
        this._tools.add(data, tx);
        return toDisposable(() => {
            this._tools.delete(data);
        });
    }
    addToolSet(toolSet, tx) {
        if (toolSet === this) {
            return Disposable.None;
        }
        this._toolSets.add(toolSet, tx);
        return toDisposable(() => {
            this._toolSets.delete(toolSet);
        });
    }
    getTools(r) {
        return Iterable.concat(Iterable.filter(this._tools.observable.read(r), toolData => this._contextKeyService.contextMatchesRules(toolData.when)), ...Iterable.map(this._toolSets.observable.read(r), toolSet => toolSet.getTools(r)));
    }
}
export class ToolSetForModel {
    get id() {
        return this._toolSet.id;
    }
    get referenceName() {
        return this._toolSet.referenceName;
    }
    get icon() {
        return this._toolSet.icon;
    }
    get source() {
        return this._toolSet.source;
    }
    get description() {
        return this._toolSet.description;
    }
    get legacyFullNames() {
        return this._toolSet.legacyFullNames;
    }
    constructor(_toolSet, model) {
        this._toolSet = _toolSet;
        this.model = model;
    }
    getTools(r) {
        return Iterable.filter(this._toolSet.getTools(r), toolData => toolMatchesModel(toolData, this.model));
    }
}
export const ILanguageModelToolsService = createDecorator('ILanguageModelToolsService');
export function createToolInputUri(toolCallId) {
    return URI.from({ scheme: Schemas.inMemory, path: `/lm/tool/${toolCallId}/tool_input.json` });
}
export function createToolSchemaUri(toolOrId) {
    if (typeof toolOrId !== 'string') {
        toolOrId = toolOrId.id;
    }
    return URI.from({ scheme: Schemas.vscode, authority: 'schemas', path: `/lm/tool/${toolOrId}` });
}
export var SpecedToolAliases;
(function (SpecedToolAliases) {
    SpecedToolAliases.execute = 'execute';
    SpecedToolAliases.edit = 'edit';
    SpecedToolAliases.search = 'search';
    SpecedToolAliases.agent = 'agent';
    SpecedToolAliases.read = 'read';
    SpecedToolAliases.web = 'web';
    SpecedToolAliases.todo = 'todo';
})(SpecedToolAliases || (SpecedToolAliases = {}));
export var VSCodeToolReference;
(function (VSCodeToolReference) {
    VSCodeToolReference.runSubagent = 'runSubagent';
    VSCodeToolReference.vscode = 'vscode';
})(VSCodeToolReference || (VSCodeToolReference = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQXNDLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXRILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHakQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQU9oRyxPQUFPLEVBQXFCLDBCQUEwQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUEyQ3BGOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBbUIsRUFBRSxLQUE2QztJQUNsRywwRUFBMEU7SUFDMUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsdURBQXVEO0lBQ3ZELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNaLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELHFE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