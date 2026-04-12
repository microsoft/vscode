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
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { RegisteredEditorPriority, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { ITextEditorService } from '../../../services/textfile/common/textEditorService.js';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, USE_SPLIT_JSON_SETTING } from '../../../services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SettingsFileSystemProvider } from './settingsFilesystemProvider.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
let PreferencesContribution = class PreferencesContribution extends Disposable {
    static { this.ID = 'workbench.contrib.preferences'; }
    constructor(fileService, instantiationService, preferencesService, userDataProfileService, workspaceService, configurationService, editorResolverService, textEditorService) {
        super();
        this.instantiationService = instantiationService;
        this.preferencesService = preferencesService;
        this.userDataProfileService = userDataProfileService;
        this.workspaceService = workspaceService;
        this.configurationService = configurationService;
        this.editorResolverService = editorResolverService;
        this.textEditorService = textEditorService;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(USE_SPLIT_JSON_SETTING) || e.affectsConfiguration(DEFAULT_SETTINGS_EDITOR_SETTING)) {
                this.handleSettingsEditorRegistration();
            }
        }));
        this.handleSettingsEditorRegistration();
        const fileSystemProvider = this._register(this.instantiationService.createInstance(SettingsFileSystemProvider));
        this._register(fileService.registerProvider(SettingsFileSystemProvider.SCHEMA, fileSystemProvider));
    }
    handleSettingsEditorRegistration() {
        // dispose any old listener we had
        dispose(this.editorOpeningListener);
        // install editor opening listener unless user has disabled this
        if (!!this.configurationService.getValue(USE_SPLIT_JSON_SETTING) || !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING)) {
            this.editorOpeningListener = this.editorResolverService.registerEditor('**/settings.json', {
                id: SideBySideEditorInput.ID,
                label: nls.localize('splitSettingsEditorLabel', "Split Settings Editor"),
                priority: RegisteredEditorPriority.builtin,
            }, {}, {
                createEditorInput: ({ resource, options }) => {
                    // Global User Settings File
                    if (isEqual(resource, this.userDataProfileService.currentProfile.settingsResource)) {
                        return { editor: this.preferencesService.createSplitJsonEditorInput(3 /* ConfigurationTarget.USER_LOCAL */, resource), options };
                    }
                    // Single Folder Workspace Settings File
                    const state = this.workspaceService.getWorkbenchState();
                    if (state === 2 /* WorkbenchState.FOLDER */) {
                        const folders = this.workspaceService.getWorkspace().folders;
                        if (isEqual(resource, folders[0].toResource(FOLDER_SETTINGS_PATH))) {
                            return { editor: this.preferencesService.createSplitJsonEditorInput(5 /* ConfigurationTarget.WORKSPACE */, resource), options };
                        }
                    }
                    // Multi Folder Workspace Settings File
                    else if (state === 3 /* WorkbenchState.WORKSPACE */) {
                        const folders = this.workspaceService.getWorkspace().folders;
                        for (const folder of folders) {
                            if (isEqual(resource, folder.toResource(FOLDER_SETTINGS_PATH))) {
                                return { editor: this.preferencesService.createSplitJsonEditorInput(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, resource), options };
                            }
                        }
                    }
                    return { editor: this.textEditorService.createTextEditor({ resource }), options };
                }
            });
        }
    }
    dispose() {
        dispose(this.editorOpeningListener);
        super.dispose();
    }
};
PreferencesContribution = __decorate([
    __param(0, IFileService),
    __param(1, IInstantiationService),
    __param(2, IPreferencesService),
    __param(3, IUserDataProfileService),
    __param(4, IWorkspaceContextService),
    __param(5, IConfigurationService),
    __param(6, IEditorResolverService),
    __param(7, ITextEditorService)
], PreferencesContribution);
export { PreferencesContribution };
const registry = Registry.as(Extensions.Configuration);
registry.registerConfiguration({
    ...workbenchConfigurationNodeBase,
    'properties': {
        'workbench.settings.enableNaturalLanguageSearch': {
            'type': 'boolean',
            'description': nls.localize('enableNaturalLanguageSettingsSearch', "Controls whether to enable the natural language search mode for settings. The natural language search is provided by a Microsoft online service."),
            'default': true,
            'scope': 4 /* ConfigurationScope.WINDOW */,
            'tags': ['usesOnlineServices']
        },
        'workbench.settings.settingsSearchTocBehavior': {
            'type': 'string',
            'enum': ['hide', 'filter'],
            'enumDescriptions': [
                nls.localize('settingsSearchTocBehavior.hide', "Hide the Table of Contents while searching."),
                nls.localize('settingsSearchTocBehavior.filter', "Filter the Table of Contents to just categories that have matching settings. Clicking on a category will filter the results to that category."),
            ],
            'description': nls.localize('settingsSearchTocBehavior', "Controls the behavior of the Settings editor Table of Contents while searching. If this setting is being changed in the Settings editor, the setting will take effect after the search query is modified."),
            'default': 'filter',
            'scope': 4 /* ConfigurationScope.WINDOW */
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFzQixVQUFVLEVBQTBCLE1BQU0sb0VBQW9FLENBQUM7QUFDNUksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSx3QkFBd0IsRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUdsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsK0JBQStCLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN6SyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRD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