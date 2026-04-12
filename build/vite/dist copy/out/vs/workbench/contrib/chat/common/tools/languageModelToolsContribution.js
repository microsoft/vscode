/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { transaction } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ILanguageModelToolsService, ToolDataSource } from './languageModelToolsService.js';
import { toolsParametersSchemaSchemaId } from './languageModelToolsParametersSchema.js';
const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'languageModelTools',
    activationEventsGenerator: function* (contributions) {
        for (const contrib of contributions) {
            yield `onLanguageModelTool:${contrib.name}`;
        }
    },
    jsonSchema: {
        description: localize('vscode.extension.contributes.tools', 'Contributes a tool that can be invoked by a language model in a chat session, or from a standalone command. Registered tools can be used by all extensions.'),
        type: 'array',
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{
                    body: {
                        name: '${1}',
                        modelDescription: '${2}',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                '${3:name}': {
                                    type: 'string',
                                    description: '${4:description}'
                                }
                            }
                        },
                    }
                }],
            required: ['name', 'displayName', 'modelDescription'],
            properties: {
                name: {
                    description: localize('toolName', "A unique name for this tool. This name must be a globally unique identifier, and is also used as a name when presenting this tool to a language model."),
                    type: 'string',
                    // [\\w-]+ is OpenAI's requirement for tool names
                    pattern: '^(?!copilot_|vscode_)[\\w-]+$'
                },
                toolReferenceName: {
                    markdownDescription: localize('toolName2', "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", '`canBeReferencedInPrompt`'),
                    type: 'string',
                    pattern: '^[\\w-]+$'
                },
                displayName: {
                    description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
                    type: 'string'
                },
                userDescription: {
                    description: localize('toolUserDescription', "A description of this tool that may be shown to the user."),
                    type: 'string'
                },
                // eslint-disable-next-line local/code-no-localized-model-description
                modelDescription: {
                    description: localize('toolModelDescription', "A description of this tool that may be used by a language model to select it."),
                    type: 'string'
                },
                inputSchema: {
                    description: localize('parametersSchema', "A JSON schema for the input this tool accepts. The input must be an object at the top level. A particular language model may not support all JSON schema features. See the documentation for the language model family you are using for more information."),
                    $ref: toolsParametersSchemaSchemaId
                },
                canBeReferencedInPrompt: {
                    markdownDescription: localize('canBeReferencedInPrompt', "If true, this tool shows up as an attachment that the user can add manually to their request. Chat participants will receive the tool in {0}.", '`ChatRequest#toolReferences`'),
                    type: 'boolean'
                },
                icon: {
                    markdownDescription: localize('icon', 'An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like "\\$(zap)"'),
                    anyOf: [{
                            type: 'string'
                        },
                        {
                            type: 'object',
                            properties: {
                                light: {
                                    description: localize('icon.light', 'Icon path when a light theme is used'),
                                    type: 'string'
                                },
                                dark: {
                                    description: localize('icon.dark', 'Icon path when a dark theme is used'),
                                    type: 'string'
                                }
                            }
                        }]
                },
                when: {
                    markdownDescription: localize('condition', "Condition which must be true for this tool to be enabled. Note that a tool may still be invoked by another extension even when its `when` condition is false."),
                    type: 'string'
                },
                tags: {
                    description: localize('toolTags', "A set of tags that roughly describe the tool's capabilities. A tool user may use these to filter the set of tools to just ones that are relevant for the task at hand, or they may want to pick a tag that can be used to identify just the tools contributed by this extension."),
                    type: 'array',
                    items: {
                        type: 'string',
                        pattern: '^(?!copilot_|vscode_)'
                    }
                }
            }
        }
    }
});
const languageModelToolSetsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'languageModelToolSets',
    deps: [languageModelToolsExtensionPoint],
    jsonSchema: {
        description: localize('vscode.extension.contributes.toolSets', 'Contributes a set of language model tools that can be used together.'),
        type: 'array',
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{
                    body: {
                        name: '${1}',
                        description: '${2}',
                        tools: ['${3}']
                    }
                }],
            required: ['name', 'description', 'tools'],
            properties: {
                name: {
                    description: localize('toolSetName', "A name for this tool set. Used as reference and should not contain whitespace."),
                    type: 'string',
                    pattern: '^[\\w-]+$'
                },
                description: {
                    description: localize('toolSetDescription', "A description of this tool set."),
                    type: 'string'
                },
                icon: {
                    markdownDescription: localize('toolSetIcon', "An icon that represents this tool set, like {0}", '`$(zap)`'),
                    type: 'string'
                },
                tools: {
                    markdownDescription: localize('toolSetTools', "A list of tools or tool sets to include in this tool set. Cannot be empty and must reference tools by their `toolReferenceName`."),
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'string'
                    }
                }
            }
        }
    }
});
function toToolKey(extensionIdentifier, toolName) {
    return `${extensionIdentifier.value}/${toolName}`;
}
export function toToolSetKey(extensionIdentifier, toolName) {
    return `toolset:${extensionIdentifier.value}/${toolName}`;
}
let LanguageModelToolsExtensionPointHandler = class LanguageModelToolsExtensionPointHandler {
    static { this.ID = 'workbench.contrib.toolsExtensionPointHandler'; }
    constructor(productService, languageModelToolsService) {
        this._registrationDisposables = new DisposableMap();
        languageModelToolsExtensionPoint.setHandler((_extensions, delta) => {
            for (const extension of delta.added) {
                for (const rawTool of extension.value) {
                    if (!rawTool.name || !rawTool.modelDescription || !rawTool.displayName) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name, modelDescription, and displayName: ${JSON.stringify(rawTool)}`);
                        continue;
                    }
                    if (!rawTool.name.match(/^[\w-]+$/)) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.name}. The id must match /^[\\w-]+$/.`);
                        continue;
                    }
                    if (rawTool.canBeReferencedInPrompt && !rawTool.toolReferenceName) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeReferencedInPrompt' set without a 'toolReferenceName': ${JSON.stringify(rawTool)}`);
                        continue;
                    }
                    if ((rawTool.name.startsWith('copilot_') || rawTool.name.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with name starting with "vscode_" or "copilot_"`);
                        continue;
                    }
                    if (rawTool.tags?.some(tag => tag.startsWith('copilot_') || tag.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with tags starting with "vscode_" or "copilot_"`);
                    }
                    if (rawTool.legacyToolReferenceFullNames && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled`);
                        continue;
                    }
                    const rawIcon = rawTool.icon;
                    let icon;
                    if (typeof rawIcon === 'string') {
                        icon = ThemeIcon.fromString(rawIcon) ?? {
                            dark: joinPath(extension.description.extensionLocation, rawIcon),
                            light: joinPath(extension.description.extensionLocation, rawIcon)
                        };
                    }
                    else if (rawIcon) {
                        icon = {
                            dark: joinPath(extension.description.extensionLocation, rawIcon.dark),
                            light: joinPath(extension.description.extensionLocation, rawIcon.light)
                        };
                    }
                    // If OSS and the product.json is not set up, fall back to checking api proposal
                    const isBuiltinTool = productService.defaultChatAgent?.chatExtensionId ?
                        ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId) :
                        isProposedApiEnabled(extension.description, 'chatParticipantPrivate');
                    const source = isBuiltinTool
                        ? ToolDataSource.Internal
                        : { type: 'extension', label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };
                    const tool = {
                        ...rawTool,
                        source,
                        inputSchema: rawTool.inputSchema,
                        id: rawTool.name,
                        icon,
                        when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : undefined,
                        alwaysDisplayInputOutput: !isBuiltinTool,
                    };
                    try {
                        const disposable = languageModelToolsService.registerToolData(tool);
                        this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.name), disposable);
                    }
                    catch (e) {
                        extension.collector.error(`Failed to register tool '${rawTool.name}': ${e}`);
                    }
                }
            }
            for (const extension of delta.removed) {
                for (const tool of extension.value) {
                    this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
                }
            }
        });
        languageModelToolSetsExtensionPoint.setHandler((_extensions, delta) => {
            for (const extension of delta.added) {
                if (!isProposedApiEnabled(extension.description, 'contribLanguageModelToolSets')) {
                    extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register language model tools because the 'contribLanguageModelToolSets' API proposal is not enabled.`);
                    continue;
                }
                const isBuiltinTool = productService.defaultChatAgent?.chatExtensionId ?
                    ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId) :
                    isProposedApiEnabled(extension.description, 'chatParticipantPrivate');
                const source = isBuiltinTool
                    ? ToolDataSource.Internal
                    : { type: 'extension', label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };
                for (const toolSet of extension.value) {
                    if (isFalsyOrWhitespace(toolSet.name)) {
                        extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty name`);
                        continue;
                    }
                    if (toolSet.legacyFullNames && !isProposedApiEnabled(extension.description, 'contribLanguageModelToolSets')) {
                        extension.collector.error(`Tool set '${toolSet.name}' CANNOT use 'legacyFullNames' without the 'contribLanguageModelToolSets' API proposal enabled`);
                        continue;
                    }
                    if (isFalsyOrEmpty(toolSet.tools)) {
                        extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array`);
                        continue;
                    }
                    const tools = [];
                    const toolSets = [];
                    const missingToolNames = [];
                    for (const toolName of toolSet.tools) {
                        const toolObj = languageModelToolsService.getToolByName(toolName);
                        if (toolObj) {
                            tools.push(toolObj);
                            continue;
                        }
                        const toolSetObj = languageModelToolsService.getToolSetByName(toolName);
                        if (toolSetObj) {
                            toolSets.push(toolSetObj);
                            continue;
                        }
                        missingToolNames.push(toolName);
                    }
                    if (toolSets.length === 0 && tools.length === 0) {
                        extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array (none of the tools were found)`);
                        continue;
                    }
                    const store = new DisposableStore();
                    const referenceName = toolSet.referenceName ?? toolSet.name;
                    const existingToolSet = languageModelToolsService.getToolSetByName(referenceName);
                    const mergeExisting = isBuiltinTool && existingToolSet?.source === ToolDataSource.Internal;
                    let obj;
                    // Allow built-in tool to update the tool set if it already exists
                    if (mergeExisting) {
                        obj = existingToolSet;
                    }
                    else {
                        obj = languageModelToolsService.createToolSet(source, toToolSetKey(extension.description.identifier, toolSet.name), referenceName, { icon: toolSet.icon ? ThemeIcon.fromString(toolSet.icon) : undefined, description: toolSet.description, legacyFullNames: toolSet.legacyFullNames });
                    }
                    transaction(tx => {
                        if (!mergeExisting) {
                            store.add(obj);
                        }
                        tools.forEach(tool => store.add(obj.addTool(tool, tx)));
                        toolSets.forEach(toolSet => store.add(obj.addToolSet(toolSet, tx)));
                    });
                    // Listen for late-registered tools that weren't available at contribution time
                    if (missingToolNames.length > 0) {
                        const pending = new Set(missingToolNames);
                        const listener = store.add(languageModelToolsService.onDidChangeTools(() => {
                            for (const toolName of pending) {
                                const toolObj = languageModelToolsService.getToolByName(toolName);
                                if (toolObj) {
                                    store.add(obj.addTool(toolObj));
                                    pending.delete(toolName);
                                }
                                else {
                                    const toolSetObj = languageModelToolsService.getToolSetByName(toolName);
                                    if (toolSetObj) {
                                        store.add(obj.addToolSet(toolSetObj));
                                        pending.delete(toolName);
                                    }
                                }
                            }
                            if (pending.size === 0) {
                                // done
                                store.delete(listener);
                            }
                        }));
                    }
                    this._registrationDisposables.set(toToolSetKey(extension.description.identifier, toolSet.name), store);
                }
            }
            for (const extension of delta.removed) {
                for (const toolSet of extension.value) {
                    this._registrationDisposables.deleteAndDispose(toToolSetKey(extension.description.identifier, toolSet.name));
                }
            }
        });
    }
};
LanguageModelToolsExtensionPointHandler = __decorate([
    __param(0, IProductService),
    __param(1, ILanguageModelToolsService)
], LanguageModelToolsExtensionPointHandler);
export { LanguageModelToolsExtensionPointHandler };
// --- render
class LanguageModelToolDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.languageModelTools;
    }
    render(manifest) {
        const contribs = manifest.contributes?.languageModelTools ?? [];
        if (!contribs.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('toolTableName', "Name"),
            localize('toolTableDisplayName', "Display Name"),
            localize('toolTableDescription', "Description"),
        ];
        const rows = contribs.map(t => {
            return [
                new MarkdownString(`\`${t.name}\``),
                t.displayName,
                t.userDescription ?? t.modelDescription,
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'languageModelTools',
    label: localize('langModelTools', "Language Model Tools"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(LanguageModelToolDataRenderer),
});
class LanguageModelToolSetDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.languageModelToolSets;
    }
    render(manifest) {
        const contribs = manifest.contributes?.languageModelToolSets ?? [];
        if (!contribs.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('name', "Name"),
            localize('reference', "Reference Name"),
            localize('tools', "Tools"),
            localize('descriptions', "Description"),
        ];
        const rows = contribs.map(t => {
            return [
                new MarkdownString(`\`${t.name}\``),
                t.referenceName ? new MarkdownString(`\`#${t.referenceName}\``) : 'none',
                t.tools.join(', '),
                t.description,
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'languageModelToolSets',
    label: localize('langModelToolSets', "Language Model Tool Sets"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(LanguageModelToolSetDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQXNCLE1BQU0seURBQXlELENBQUM7QUFDbEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFL0UsT0FBTyxFQUFFLFVBQVUsRUFBbUcsTUFBTSxzRUFBc0UsQ0FBQztBQUNuTSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUs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