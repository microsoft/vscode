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
var DynamicEditorConfigurations_1;
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Event } from '../../../../base/common/event.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ByteSize, getLargeFileConfirmationLimit } from '../../../../platform/files/common/files.js';
let DynamicEditorConfigurations = class DynamicEditorConfigurations extends Disposable {
    static { DynamicEditorConfigurations_1 = this; }
    static { this.ID = 'workbench.contrib.dynamicEditorConfigurations'; }
    static { this.AUTO_LOCK_DEFAULT_ENABLED = new Set([
        'terminalEditor',
        'mainThreadWebview-simpleBrowser.view',
        'mainThreadWebview-browserPreview',
        'workbench.editor.processExplorer'
    ]); }
    static { this.AUTO_LOCK_EXTRA_EDITORS = [
        // List some editor input identifiers that are not
        // registered yet via the editor resolver infrastructure
        {
            id: 'workbench.input.interactive',
            label: localize('interactiveWindow', 'Interactive Window'),
            priority: RegisteredEditorPriority.builtin
        },
        {
            id: 'mainThreadWebview-markdown.preview',
            label: localize('markdownPreview', "Markdown Preview"),
            priority: RegisteredEditorPriority.builtin
        },
        {
            id: 'mainThreadWebview-simpleBrowser.view',
            label: localize('simpleBrowser', "Simple Browser"),
            priority: RegisteredEditorPriority.builtin
        },
        {
            id: 'mainThreadWebview-browserPreview',
            label: localize('livePreview', "Live Preview"),
            priority: RegisteredEditorPriority.builtin
        }
    ]; }
    static { this.AUTO_LOCK_REMOVE_EDITORS = new Set([
        // List some editor types that the above `AUTO_LOCK_EXTRA_EDITORS`
        // already covers to avoid duplicates.
        'vscode-interactive-input',
        'interactive',
        'vscode.markdown.preview.editor'
    ]); }
    constructor(editorResolverService, extensionService, environmentService) {
        super();
        this.editorResolverService = editorResolverService;
        this.environmentService = environmentService;
        this.configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        // Editor configurations are getting updated very aggressively
        // (atleast 20 times) while the extensions are getting registered.
        // As such push out the dynamic configuration until after extensions
        // are registered.
        (async () => {
            await extensionService.whenInstalledExtensionsRegistered();
            this.updateDynamicEditorConfigurations();
            this.registerListeners();
        })();
    }
    registerListeners() {
        // Registered editors (debounced to reduce perf overhead)
        this._register(Event.debounce(this.editorResolverService.onDidChangeEditorRegistrations, (_, e) => e)(() => this.updateDynamicEditorConfigurations()));
    }
    updateDynamicEditorConfigurations() {
        const lockableEditors = [...this.editorResolverService.getEditors(), ...DynamicEditorConfigurations_1.AUTO_LOCK_EXTRA_EDITORS].filter(e => !DynamicEditorConfigurations_1.AUTO_LOCK_REMOVE_EDITORS.has(e.id));
        const binaryEditorCandidates = this.editorResolverService.getEditors().filter(e => e.priority !== RegisteredEditorPriority.exclusive).map(e => e.id);
        // Build config from registered editors
        const autoLockGroupConfiguration = Object.create(null);
        for (const editor of lockableEditors) {
            autoLockGroupConfiguration[editor.id] = {
                type: 'boolean',
                default: DynamicEditorConfigurations_1.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id),
                description: editor.label
            };
        }
        // Build default config too
        const defaultAutoLockGroupConfiguration = Object.create(null);
        for (const editor of lockableEditors) {
            defaultAutoLockGroupConfiguration[editor.id] = DynamicEditorConfigurations_1.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id);
        }
        // Register setting for auto locking groups
        const oldAutoLockConfigurationNode = this.autoLockConfigurationNode;
        this.autoLockConfigurationNode = {
            ...workbenchConfigurationNodeBase,
            properties: {
                'workbench.editor.autoLockGroups': {
                    type: 'object',
                    description: localize('workbench.editor.autoLockGroups', "If an editor matching one of the listed types is opened as the first in an editor group and more than one group is open, the group is automatically locked. Locked groups will only be used for opening editors when explicitly chosen by a user gesture (for example drag and drop), but not by default. Consequently, the active editor in a locked group is less likely to be replaced accidentally with a different editor."),
                    properties: autoLockGroupConfiguration,
                    default: defaultAutoLockGroupConfiguration,
                    additionalProperties: false
                }
            }
        };
        // Registers setting for default binary editors
        const oldDefaultBinaryEditorConfigurationNode = this.defaultBinaryEditorConfigurationNode;
        this.defaultBinaryEditorConfigurationNode = {
            ...workbenchConfigurationNodeBase,
            properties: {
                'workbench.editor.defaultBinaryEditor': {
                    type: 'string',
                    default: '',
                    // This allows for intellisense autocompletion
                    enum: [...binaryEditorCandidates, ''],
                    description: localize('workbench.editor.defaultBinaryEditor', "The default editor for files detected as binary. If undefined, the user will be presented with a picker."),
                }
            }
        };
        // Registers setting for editorAssociations
        const oldEditorAssociationsConfigurationNode = this.editorAssociationsConfigurationNode;
        this.editorAssociationsConfigurationNode = {
            ...workbenchConfigurationNodeBase,
            properties: {
                'workbench.editorAssociations': {
                    type: 'object',
                    markdownDescription: localize('editor.editorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors (for example `\"*.hex\": \"hexEditor.hexedit\"`). These have precedence over the default behavior."),
                    patternProperties: {
                        '.*': {
                            type: 'string',
                            enum: binaryEditorCandidates,
                        }
                    }
                }
            }
        };
        // Registers setting for large file confirmation based on environment
        const oldEditorLargeFileConfirmationConfigurationNode = this.editorLargeFileConfirmationConfigurationNode;
        this.editorLargeFileConfirmationConfigurationNode = {
            ...workbenchConfigurationNodeBase,
            properties: {
                'workbench.editorLargeFileConfirmation': {
                    type: 'number',
                    default: getLargeFileConfirmationLimit(this.environmentService.remoteAuthority) / ByteSize.MB,
                    minimum: 1,
                    scope: 5 /* ConfigurationScope.RESOURCE */,
                    markdownDescription: localize('editorLargeFileSizeConfirmation', "Controls the minimum size of a file in MB before asking for confirmation when opening in the editor. Note that this setting may not apply to all editor types and environments."),
                }
            }
        };
        this.configurationRegistry.updateConfigurations({
            add: [
                this.autoLockConfigurationNode,
                this.defaultBinaryEditorConfigurationNode,
                this.editorAssociationsConfigurationNode,
                this.editorLargeFileConfirmationConfigurationNode
            ],
            remove: coalesce([
                oldAutoLockConfigurationNode,
                oldDefaultBinaryEditorConfigurationNode,
                oldEditorAssociationsConfigurationNode,
                oldEditorLargeFileConfirmationConfigurationNode
            ])
        });
    }
};
DynamicEditorConfigurations = DynamicEditorConfigurations_1 = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IExtensionService),
    __param(2, IWorkbenchEnvironmentService)
], DynamicEditorConfigurations);
export { DynamicEditorConfigurations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQ29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBMEMsTUFBTSxvRUFBb0UsQ0FBQztBQUMzTCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsc0JBQXNCLEVBQXdCLHdCQUF3QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFbEosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsUUFBUSxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFOUYsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVOzthQUUxQyxPQUFFLEdBQUcsK0NBQStDLEFBQWxELENBQW1EO2FBRTdDLDhCQUF5QixHQUFHLElBQUksR0FBRyxDQUFTO1FBQ25FLGdCQUFnQjtRQUNoQixzQ0FBc0M7UUFDdEMsa0NBQWtDO1FBQ2xDLGtD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