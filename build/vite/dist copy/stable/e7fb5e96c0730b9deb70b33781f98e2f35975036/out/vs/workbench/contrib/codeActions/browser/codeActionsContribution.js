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
import { Emitter, Event } from '../../../../base/common/event.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { codeActionCommandId, refactorCommandId, sourceActionCommandId } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import * as nls from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
const createCodeActionsAutoSave = (description) => {
    return {
        type: 'string',
        enum: ['always', 'explicit', 'never', true, false],
        enumDescriptions: [
            nls.localize('alwaysSave', 'Triggers Code Actions on explicit saves and auto saves triggered by window or focus changes.'),
            nls.localize('explicitSave', 'Triggers Code Actions only when explicitly saved'),
            nls.localize('neverSave', 'Never triggers Code Actions on save'),
            nls.localize('explicitSaveBoolean', 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
            nls.localize('neverSaveBoolean', 'Never triggers Code Actions on save. This value will be deprecated in favor of "never".')
        ],
        default: 'explicit',
        description: description
    };
};
const createNotebookCodeActionsAutoSave = (description) => {
    return {
        type: ['string', 'boolean'],
        enum: ['explicit', 'never', true, false],
        enumDescriptions: [
            nls.localize('explicit', 'Triggers Code Actions only when explicitly saved.'),
            nls.localize('never', 'Never triggers Code Actions on save.'),
            nls.localize('explicitBoolean', 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
            nls.localize('neverBoolean', 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "never".')
        ],
        default: 'explicit',
        description: description
    };
};
const codeActionsOnSaveSchema = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: {
                type: 'string'
            },
        },
        {
            type: 'array',
            items: { type: 'string' }
        }
    ],
    markdownDescription: nls.localize('editor.codeActionsOnSave', 'Run Code Actions for the editor on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"source.organizeImports": "explicit" `', '`#files.autoSave#`'),
    type: ['object', 'array'],
    additionalProperties: {
        type: 'string',
        enum: ['always', 'explicit', 'never', true, false],
    },
    default: {},
    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
};
export const editorConfiguration = Object.freeze({
    ...editorConfigurationBaseNode,
    properties: {
        'editor.codeActionsOnSave': codeActionsOnSaveSchema
    }
});
const notebookCodeActionsOnSaveSchema = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: {
                type: 'string'
            },
        },
        {
            type: 'array',
            items: { type: 'string' }
        }
    ],
    markdownDescription: nls.localize('notebook.codeActionsOnSave', 'Run a series of Code Actions for a notebook on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"notebook.source.organizeImports": "explicit"`', '`#files.autoSave#`'),
    type: 'object',
    additionalProperties: {
        type: ['string', 'boolean'],
        enum: ['explicit', 'never', true, false],
        // enum: ['explicit', 'always', 'never'], -- autosave support needs to be built first
        // nls.localize('always', 'Always triggers Code Actions on save, including autosave, focus, and window change events.'),
    },
    default: {}
};
export const notebookEditorConfiguration = Object.freeze({
    ...editorConfigurationBaseNode,
    properties: {
        'notebook.codeActionsOnSave': notebookCodeActionsOnSaveSchema
    }
});
let CodeActionsContribution = class CodeActionsContribution extends Disposable {
    constructor(keybindingService, languageFeatures) {
        super();
        this.languageFeatures = languageFeatures;
        this._onDidChangeSchemaContributions = this._register(new Emitter());
        this._allProvidedCodeActionKinds = [];
        // TODO: @justschen caching of code actions based on extensions loaded: https://github.com/microsoft/vscode/issues/216019
        this._register(Event.runAndSubscribe(Event.debounce(languageFeatures.codeActionProvider.onDidChange, () => { }, 1000), () => {
            this._allProvidedCodeActionKinds = this.getAllProvidedCodeActionKinds();
            this.updateConfigurationSchema(this._allProvidedCodeActionKinds);
            this._onDidChangeSchemaContributions.fire();
        }));
        this._register(keybindingService.registerSchemaContribution({
            getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
            onDidChange: this._onDidChangeSchemaContributions.event,
        }));
    }
    getAllProvidedCodeActionKinds() {
        const out = new Map();
        for (const provider of this.languageFeatures.codeActionProvider.allNoModel()) {
            for (const kind of provider.providedCodeActionKinds ?? []) {
                out.set(kind, new HierarchicalKind(kind));
            }
        }
        return Array.from(out.values());
    }
    updateConfigurationSchema(allProvidedKinds) {
        const properties = { ...codeActionsOnSaveSchema.properties };
        const notebookProperties = { ...notebookCodeActionsOnSaveSchema.properties };
        for (const codeActionKind of allProvidedKinds) {
            if (CodeActionKind.Source.contains(codeActionKind) && !properties[codeActionKind.value]) {
                properties[codeActionKind.value] = createCodeActionsAutoSave(nls.localize('codeActionsOnSave.generic', "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
                notebookProperties[codeActionKind.value] = createNotebookCodeActionsAutoSave(nls.localize('codeActionsOnSave.generic', "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
            }
        }
        codeActionsOnSaveSchema.properties = properties;
        notebookCodeActionsOnSaveSchema.properties = notebookProperties;
        Registry.as(Extensions.Configuration)
            .notifyConfigurationSchemaUpdated(editorConfiguration);
    }
    getKeybindingSchemaAdditions() {
        const conditionalSchema = (command, kinds) => {
            return {
                if: {
                    required: ['command'],
                    properties: {
                        'command': { const: command }
                    }
                },
                then: {
                    properties: {
                        'args': {
                            required: ['kind'],
                            properties: {
                                'kind': {
                                    anyOf: [
                                        { enum: Array.from(kinds) },
                                        { type: 'string' },
                                    ]
                                }
                            }
                        }
                    }
                }
            };
        };
        const filterProvidedKinds = (ofKind) => {
            const out = new Set();
            for (const providedKind of this._allProvidedCodeActionKinds) {
                if (ofKind.contains(providedKind)) {
                    out.add(providedKind.value);
                }
            }
            return Array.from(out);
        };
        return [
            conditionalSchema(codeActionCommandId, filterProvidedKinds(HierarchicalKind.Empty)),
            conditionalSchema(refactorCommandId, filterProvidedKinds(CodeActionKind.Refactor)),
            conditionalSchema(sourceActionCommandId, filterProvidedKinds(CodeActionKind.Source)),
        ];
    }
};
CodeActionsContribution = __decorate([
    __param(0, IKeybindingService),
    __param(1, ILanguageFeaturesService)
], CodeActionsContribution);
export { CodeActionsContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbnNDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlQWN0aW9ucy9icm93c2VyL2NvZGVBY3Rpb25zQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzVJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBc0IsVUFBVSxFQUE0RSxNQUFNLG9FQUFvRSxDQUFDO0FBQzlMLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUc1RSxNQUFNLHlCQUF5QixHQUFHLENBQUMsV0FBbUIsRUFBZSxFQUFFO0lBQ3RFLE9BQU87UUFDTixJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUM7UUFDbEQsZ0JB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