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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { pasteAsCommandId } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js';
import { pasteAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { dropAsPreferenceConfig } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import * as nls from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
const dropEnumValues = [];
const dropAsPreferenceSchema = {
    type: 'array',
    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
    description: nls.localize('dropPreferredDescription', "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
    default: [],
    items: {
        description: nls.localize('dropKind', "The kind identifier of the drop edit."),
        anyOf: [
            { type: 'string' },
            { enum: dropEnumValues }
        ],
    }
};
const pasteEnumValues = [];
const pasteAsPreferenceSchema = {
    type: 'array',
    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
    description: nls.localize('pastePreferredDescription', "Configures the preferred type of edit to use when pasting content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
    default: [],
    items: {
        description: nls.localize('pasteKind', "The kind identifier of the paste edit."),
        anyOf: [
            { type: 'string' },
            { enum: pasteEnumValues }
        ]
    }
};
export const editorConfiguration = Object.freeze({
    ...editorConfigurationBaseNode,
    properties: {
        [pasteAsPreferenceConfig]: pasteAsPreferenceSchema,
        [dropAsPreferenceConfig]: dropAsPreferenceSchema,
    }
});
let DropOrPasteSchemaContribution = class DropOrPasteSchemaContribution extends Disposable {
    static { this.ID = 'workbench.contrib.dropOrPasteIntoSchema'; }
    constructor(keybindingService, languageFeatures) {
        super();
        this.languageFeatures = languageFeatures;
        this._onDidChangeSchemaContributions = this._register(new Emitter());
        this._allProvidedDropKinds = [];
        this._allProvidedPasteKinds = [];
        this._register(Event.runAndSubscribe(Event.debounce(Event.any(languageFeatures.documentPasteEditProvider.onDidChange, languageFeatures.documentPasteEditProvider.onDidChange), () => { }, 1000), () => {
            this.updateProvidedKinds();
            this.updateConfigurationSchema();
            this._onDidChangeSchemaContributions.fire();
        }));
        this._register(keybindingService.registerSchemaContribution({
            getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
            onDidChange: this._onDidChangeSchemaContributions.event,
        }));
    }
    updateProvidedKinds() {
        // Drop
        const dropKinds = new Map();
        for (const provider of this.languageFeatures.documentDropEditProvider.allNoModel()) {
            for (const kind of provider.providedDropEditKinds ?? []) {
                dropKinds.set(kind.value, kind);
            }
        }
        this._allProvidedDropKinds = Array.from(dropKinds.values());
        // Paste
        const pasteKinds = new Map();
        for (const provider of this.languageFeatures.documentPasteEditProvider.allNoModel()) {
            for (const kind of provider.providedPasteEditKinds ?? []) {
                pasteKinds.set(kind.value, kind);
            }
        }
        this._allProvidedPasteKinds = Array.from(pasteKinds.values());
    }
    updateConfigurationSchema() {
        pasteEnumValues.length = 0;
        for (const codeActionKind of this._allProvidedPasteKinds) {
            pasteEnumValues.push(codeActionKind.value);
        }
        dropEnumValues.length = 0;
        for (const codeActionKind of this._allProvidedDropKinds) {
            dropEnumValues.push(codeActionKind.value);
        }
        Registry.as(Extensions.Configuration)
            .notifyConfigurationSchemaUpdated(editorConfiguration);
    }
    getKeybindingSchemaAdditions() {
        return [
            {
                if: {
                    required: ['command'],
                    properties: {
                        'command': { const: pasteAsCommandId }
                    }
                },
                then: {
                    properties: {
                        'args': {
                            oneOf: [
                                {
                                    required: ['kind'],
                                    properties: {
                                        'kind': {
                                            anyOf: [
                                                { enum: Array.from(this._allProvidedPasteKinds.map(x => x.value)) },
                                                { type: 'string' },
                                            ]
                                        }
                                    }
                                },
                                {
                                    required: ['preferences'],
                                    properties: {
                                        'preferences': {
                                            type: 'array',
                                            items: {
                                                anyOf: [
                                                    { enum: Array.from(this._allProvidedPasteKinds.map(x => x.value)) },
                                                    { type: 'string' },
                                                ]
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
        ];
    }
};
DropOrPasteSchemaContribution = __decorate([
    __param(0, IKeybindingService),
    __param(1, ILanguageFeaturesService)
], DropOrPasteSchemaContribution);
export { DropOrPasteSchemaContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvbmZpZ3VyYXRpb25TY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUdsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDNUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDL0csT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFDcEgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFDeEgsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQXNCLFVBQVUsRUFBNEUsTUFBTSxvRUFBb0UsQ0FBQztBQUM5TCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFHNUUsTUFBTSxjQUFjLEdBQWEsRUFBRSxDQUFDO0FBRXBDLE1BQU0sc0JBQXNCLEdBQWlDO0lBQzVELElBQUksRUFBRSxPQUFPO0lBQ2IsS0FBSyxpREFBeUM7SUFDOUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsMEtBQTBLLENBQUM7SUFDak8sT0FBTyxFQUFFLEVBQUU7SUFDWCxL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