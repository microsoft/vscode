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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextEditorService } from '../../../services/textfile/common/textEditorService.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { equals } from '../../../../base/common/objects.js';
import { visit } from '../../../../base/common/json.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILanguageModelsService } from '../common/languageModels.js';
let LanguageModelsConfigurationService = class LanguageModelsConfigurationService extends Disposable {
    get configurationFile() { return this.modelsConfigurationFile; }
    constructor(fileService, textFileService, textModelService, editorService, textEditorService, userDataProfileService, uriIdentityService) {
        super();
        this.fileService = fileService;
        this.textFileService = textFileService;
        this.textModelService = textModelService;
        this.editorService = editorService;
        this.textEditorService = textEditorService;
        this._onDidChangeLanguageModelGroups = this._register(new Emitter());
        this.onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
        this.languageModelsProviderGroups = [];
        this.modelsConfigurationFile = uriIdentityService.extUri.joinPath(userDataProfileService.currentProfile.location, 'chatLanguageModels.json');
        this.updateLanguageModelsConfiguration();
        this._register(fileService.watch(this.modelsConfigurationFile));
        this._register(fileService.onDidFilesChange(e => {
            if (e.contains(this.modelsConfigurationFile)) {
                this.updateLanguageModelsConfiguration();
            }
        }));
    }
    setLanguageModelsConfiguration(languageModelsConfiguration) {
        const changedGroups = [];
        const oldGroupMap = new Map(this.languageModelsProviderGroups.map(g => [`${g.vendor}:${g.name}`, g]));
        const newGroupMap = new Map(languageModelsConfiguration.map(g => [`${g.vendor}:${g.name}`, g]));
        // Find added or modified groups
        for (const [key, newGroup] of newGroupMap) {
            const oldGroup = oldGroupMap.get(key);
            if (!oldGroup || !equals(oldGroup, newGroup)) {
                changedGroups.push(newGroup);
            }
        }
        // Find removed groups
        for (const [key, oldGroup] of oldGroupMap) {
            if (!newGroupMap.has(key)) {
                changedGroups.push(oldGroup);
            }
        }
        this.languageModelsProviderGroups = languageModelsConfiguration;
        if (changedGroups.length > 0) {
            this._onDidChangeLanguageModelGroups.fire(changedGroups);
        }
    }
    async updateLanguageModelsConfiguration() {
        const languageModelsProviderGroups = await this.withLanguageModelsProviderGroups();
        this.setLanguageModelsConfiguration(languageModelsProviderGroups);
    }
    getLanguageModelsProviderGroups() {
        return this.languageModelsProviderGroups;
    }
    async addLanguageModelsProviderGroup(toAdd) {
        await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
            if (languageModelsProviderGroups.some(({ name, vendor }) => name === toAdd.name && vendor === toAdd.vendor)) {
                throw new Error(`Language model group with name ${toAdd.name} already exists for vendor ${toAdd.vendor}`);
            }
            languageModelsProviderGroups.push(toAdd);
            return languageModelsProviderGroups;
        });
        await this.updateLanguageModelsConfiguration();
        const result = this.getLanguageModelsProviderGroups().find(group => group.name === toAdd.name && group.vendor === toAdd.vendor);
        if (!result) {
            throw new Error(`Language model group with name ${toAdd.name} not found for vendor ${toAdd.vendor}`);
        }
        return result;
    }
    async updateLanguageModelsProviderGroup(from, to) {
        await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
            const result = [];
            for (const group of languageModelsProviderGroups) {
                if (group.name === from.name && group.vendor === from.vendor) {
                    result.push(to);
                }
                else {
                    result.push(group);
                }
            }
            return result;
        });
        await this.updateLanguageModelsConfiguration();
        const result = this.getLanguageModelsProviderGroups().find(group => group.name === to.name && group.vendor === to.vendor);
        if (!result) {
            throw new Error(`Language model group with name ${to.name} not found for vendor ${to.vendor}`);
        }
        return result;
    }
    async removeLanguageModelsProviderGroup(toRemove) {
        await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
            const result = [];
            for (const group of languageModelsProviderGroups) {
                if (group.name === toRemove.name && group.vendor === toRemove.vendor) {
                    continue;
                }
                result.push(group);
            }
            return result;
        });
        await this.updateLanguageModelsConfiguration();
    }
    async configureLanguageModels(options) {
        const editor = await this.editorService.openEditor(this.textEditorService.createTextEditor({ resource: this.modelsConfigurationFile }));
        if (!editor || !options?.group) {
            return;
        }
        const codeEditor = getCodeEditor(editor.getControl());
        if (!codeEditor) {
            return;
        }
        if (!options.group.range) {
            return;
        }
        if (options.snippet) {
            // Insert snippet at the end of the last property line (before the closing brace line), with comma prepended
            const model = codeEditor.getModel();
            if (!model) {
                return;
            }
            const lastPropertyLine = options.group.range.endLineNumber - 1;
            const lastPropertyLineLength = model.getLineLength(lastPropertyLine);
            const insertPosition = { lineNumber: lastPropertyLine, column: lastPropertyLineLength + 1 };
            codeEditor.setPosition(insertPosition);
            codeEditor.revealPositionNearTop(insertPosition);
            codeEditor.focus();
            SnippetController2.get(codeEditor)?.insert(',\n' + options.snippet);
        }
        else {
            const position = { lineNumber: options.group.range.startLineNumber, column: options.group.range.startColumn };
            codeEditor.setPosition(position);
            codeEditor.revealPositionNearTop(position);
            codeEditor.focus();
        }
    }
    async withLanguageModelsProviderGroups(update) {
        const exists = await this.fileService.exists(this.modelsConfigurationFile);
        if (!exists) {
            await this.fileService.writeFile(this.modelsConfigurationFile, VSBuffer.fromString(JSON.stringify([], undefined, '\t')));
        }
        const ref = await this.textModelService.createModelReference(this.modelsConfigurationFile);
        const model = ref.object.textEditorModel;
        try {
            const languageModelsProviderGroups = parseLanguageModelsProviderGroups(model);
            if (!update) {
                return languageModelsProviderGroups;
            }
            const updatedLanguageModelsProviderGroups = await update(languageModelsProviderGroups);
            for (const group of updatedLanguageModelsProviderGroups) {
                delete group.range;
            }
            model.setValue(JSON.stringify(updatedLanguageModelsProviderGroups, undefined, '\t'));
            await this.textFileService.save(this.modelsConfigurationFile);
            return updatedLanguageModelsProviderGroups;
        }
        finally {
            ref.dispose();
        }
    }
};
LanguageModelsConfigurationService = __decorate([
    __param(0, IFileService),
    __param(1, ITextFileService),
    __param(2, ITextModelService),
    __param(3, IEditorService),
    __param(4, ITextEditorService),
    __param(5, IUserDataProfileService),
    __param(6, IUriIdentityService)
], LanguageModelsConfigurationService);
export { LanguageModelsConfigurationService };
export function parseLanguageModelsProviderGroups(model) {
    const configuration = [];
    let currentProperty = null;
    let currentParent = configuration;
    const previousParents = [];
    function onValue(value, offset, length) {
        if (Array.isArray(currentParent)) {
            currentParent.push(value);
        }
        else if (currentProperty !== null) {
            currentParent[currentProperty] = value;
        }
    }
    const visitor = {
        onObjectBegin: (offset, length) => {
            const object = {};
            if (previousParents.length === 1 && Array.isArray(currentParent)) {
                const start = model.getPositionAt(offset);
                const end = model.getPositionAt(offset + length);
                object.range = {
                    startLineNumber: start.lineNumber,
                    startColumn: start.column,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column
                };
            }
            onValue(object, offset, length);
            previousParents.push(currentParent);
            currentParent = object;
            currentProperty = null;
        },
        onObjectProperty: (name, offset, length) => {
            currentProperty = name;
        },
        onObjectEnd: (offset, length) => {
            const parent = currentParent;
            if (parent.range) {
                const end = model.getPositionAt(offset + length);
                parent.range = {
                    startLineNumber: parent.range.startLineNumber,
                    startColumn: parent.range.startColumn,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column
                };
            }
            if (parent._parentConfigurationRange) {
                const end = model.getPositionAt(offset + length);
                parent._parentConfigurationRange.endLineNumber = end.lineNumber;
                parent._parentConfigurationRange.endColumn = end.column;
                delete parent._parentConfigurationRange;
            }
            currentParent = previousParents.pop();
        },
        onArrayBegin: (offset, length) => {
            if (currentParent === configuration && previousParents.length === 0) {
                previousParents.push(currentParent);
                currentProperty = null;
                return;
            }
            const array = [];
            onValue(array, offset, length);
            previousParents.push(currentParent);
            currentParent = array;
            currentProperty = null;
        },
        onArrayEnd: (offset, length) => {
            const parent = currentParent;
            if (parent._parentConfigurationRange) {
                const end = model.getPositionAt(offset + length);
                parent._parentConfigurationRange.endLineNumber = end.lineNumber;
                parent._parentConfigurationRange.endColumn = end.column;
                delete parent._parentConfigurationRange;
            }
            currentParent = previousParents.pop();
        },
        onLiteralValue: (value, offset, length) => {
            onValue(value, offset, length);
        },
    };
    visit(model.getValue(), visitor);
    return configuration;
}
const languageModelsSchemaId = 'vscode://schemas/language-models';
let ChatLanguageModelsDataContribution = class ChatLanguageModelsDataContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatLanguageModelsData'; }
    constructor(languageModelsService, languageModelsConfigurationService) {
        super();
        this.languageModelsService = languageModelsService;
        const registry = Registry.as(JSONExtensions.JSONContribution);
        this._register(registry.registerSchemaAssociation(languageModelsSchemaId, languageModelsConfigurationService.configurationFile.toString()));
        this.updateSchema(registry);
        this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.updateSchema(registry)));
    }
    updateSchema(registry) {
        const vendors = this.languageModelsService.getVendors();
        // Build per-model configuration schemas
        const modelSchemas = [];
        const modelIds = this.languageModelsService.getLanguageModelIds();
        for (const modelId of modelIds) {
            const metadata = this.languageModelsService.lookupLanguageModel(modelId);
            if (metadata?.configurationSchema) {
                modelSchemas.push({
                    if: {
                        properties: {
                            vendor: { const: metadata.vendor }
                        }
                    },
                    then: {
                        properties: {
                            settings: {
                                type: 'object',
                                properties: {
                                    [metadata.id]: metadata.configurationSchema
                                }
                            }
                        }
                    }
                });
            }
        }
        const schema = {
            type: 'array',
            items: {
                properties: {
                    vendor: {
                        type: 'string',
                        enum: vendors.map(v => v.vendor)
                    },
                    name: { type: 'string' },
                    settings: {
                        type: 'object',
                        description: localize('settings.perModelConfig', "Per-model settings"),
                    }
                },
                allOf: [
                    ...vendors.map(vendor => ({
                        if: {
                            properties: {
                                vendor: { const: vendor.vendor }
                            }
                        },
                        then: vendor.configuration
                    })),
                    ...modelSchemas
                ],
                required: ['vendor', 'name']
            }
        };
        registry.registerSchema(languageModelsSchemaId, schema);
    }
};
ChatLanguageModelsDataContribution = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, ILanguageModelsConfigurationService)
], ChatLanguageModelsDataContribution);
export { ChatLanguageModelsDataContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RCxPQUFPLEVBQWUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxD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