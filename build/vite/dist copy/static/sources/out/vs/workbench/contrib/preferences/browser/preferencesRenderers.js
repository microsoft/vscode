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
var WorkspaceConfigurationRenderer_1;
import { EventHelper, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { SubmenuAction } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, OVERRIDE_PROPERTY_REGEX, overrideIdentifiersFromKey } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { RangeHighlightDecorations } from '../../../browser/codeeditor.js';
import { settingsEditIcon } from './preferencesIcons.js';
import { EditPreferenceWidget } from './preferencesWidgets.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { DefaultSettingsEditorModel, WorkspaceConfigurationEditorModel } from '../../../services/preferences/common/preferencesModels.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { EXPERIMENTAL_INDICATOR_DESCRIPTION, PREVIEW_INDICATOR_DESCRIPTION } from '../common/preferences.js';
import { mcpConfigurationSection } from '../../mcp/common/mcpConfiguration.js';
let UserSettingsRenderer = class UserSettingsRenderer extends Disposable {
    constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
        super();
        this.editor = editor;
        this.preferencesModel = preferencesModel;
        this.preferencesService = preferencesService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.modelChangeDelayer = this._register(new Delayer(200));
        this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
        this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
        this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this.updatePreference(key, value, source)));
        this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
        this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
        this.mcpSettingsRenderer = this._register(instantiationService.createInstance(McpSettingsRenderer, editor, preferencesModel));
    }
    render() {
        this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this.associatedPreferencesModel);
        this.unsupportedSettingsRenderer.render();
        this.mcpSettingsRenderer.render();
    }
    updatePreference(key, value, source) {
        const overrideIdentifiers = source.overrideOf ? overrideIdentifiersFromKey(source.overrideOf.key) : null;
        const resource = this.preferencesModel.uri;
        this.configurationService.updateValue(key, value, { overrideIdentifiers, resource }, this.preferencesModel.configurationTarget)
            .then(() => this.onSettingUpdated(source));
    }
    onModelChanged() {
        if (!this.editor.hasModel()) {
            // model could have been disposed during the delay
            return;
        }
        this.render();
    }
    onSettingUpdated(setting) {
        this.editor.focus();
        setting = this.getSetting(setting);
        if (setting) {
            // TODO:@sandy Selection range should be template range
            this.editor.setSelection(setting.valueRange);
            this.settingHighlighter.highlight(setting, true);
        }
    }
    getSetting(setting) {
        const { key, overrideOf } = setting;
        if (overrideOf) {
            const setting = this.getSetting(overrideOf);
            for (const override of setting.overrides) {
                if (override.key === key) {
                    return override;
                }
            }
            return undefined;
        }
        return this.preferencesModel.getPreference(key);
    }
    focusPreference(setting) {
        const s = this.getSetting(setting);
        if (s) {
            this.settingHighlighter.highlight(s, true);
            this.editor.setPosition({ lineNumber: s.keyRange.startLineNumber, column: s.keyRange.startColumn });
        }
        else {
            this.settingHighlighter.clear(true);
        }
    }
    clearFocus(setting) {
        this.settingHighlighter.clear(true);
    }
    editPreference(setting) {
        const editableSetting = this.getSetting(setting);
        return !!(editableSetting && this.editSettingActionRenderer.activateOnSetting(editableSetting));
    }
};
UserSettingsRenderer = __decorate([
    __param(2, IPreferencesService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService)
], UserSettingsRenderer);
export { UserSettingsRenderer };
let WorkspaceSettingsRenderer = class WorkspaceSettingsRenderer extends UserSettingsRenderer {
    constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
        super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
        this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
    }
    render() {
        super.render();
        this.workspaceConfigurationRenderer.render();
    }
};
WorkspaceSettingsRenderer = __decorate([
    __param(2, IPreferencesService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService)
], WorkspaceSettingsRenderer);
export { WorkspaceSettingsRenderer };
let EditSettingRenderer = class EditSettingRenderer extends Disposable {
    constructor(editor, primarySettingsModel, settingHighlighter, configurationService, instantiationService, contextMenuService) {
        super();
        this.editor = editor;
        this.primarySettingsModel = primarySettingsModel;
        this.settingHighlighter = settingHighlighter;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.settingsGroups = [];
        this._onUpdateSetting = this._register(new Emitter());
        this.onUpdateSetting = this._onUpdateSetting.event;
        this.editPreferenceWidgetForCursorPosition = this._register(this.instantiationService.createInstance((EditPreferenceWidget), editor));
        this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance((EditPreferenceWidget), editor));
        this.toggleEditPreferencesForMouseMoveDelayer = this._register(new Delayer(75));
        this._register(this.editPreferenceWidgetForCursorPosition.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForCursorPosition, e)));
        this._register(this.editPreferenceWidgetForMouseMove.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));
        this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
        this._register(this.editor.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
        this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
    }
    render(settingsGroups, associatedPreferencesModel) {
        this.editPreferenceWidgetForCursorPosition.hide();
        this.editPreferenceWidgetForMouseMove.hide();
        this.settingsGroups = settingsGroups;
        this.associatedPreferencesModel = associatedPreferencesModel;
        const settings = this.getSettings(this.editor.getPosition().lineNumber);
        if (settings.length) {
            this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
        }
    }
    isDefaultSettings() {
        return this.primarySettingsModel instanceof DefaultSettingsEditorModel;
    }
    onConfigurationChanged() {
        if (!this.editor.getOption(66 /* EditorOption.glyphMargin */)) {
            this.editPreferenceWidgetForCursorPosition.hide();
            this.editPreferenceWidgetForMouseMove.hide();
        }
    }
    onPositionChanged(positionChangeEvent) {
        this.editPreferenceWidgetForMouseMove.hide();
        const settings = this.getSettings(positionChangeEvent.position.lineNumber);
        if (settings.length) {
            this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
        }
        else {
            this.editPreferenceWidgetForCursorPosition.hide();
        }
    }
    onMouseMoved(mouseMoveEvent) {
        const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
        if (editPreferenceWidget) {
            this.onMouseOver(editPreferenceWidget);
            return;
        }
        this.settingHighlighter.clear();
        this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent));
    }
    getEditPreferenceWidgetUnderMouse(mouseMoveEvent) {
        if (mouseMoveEvent.target.type === 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */) {
            const line = mouseMoveEvent.target.position.lineNumber;
            if (this.editPreferenceWidgetForMouseMove.getLine() === line && this.editPreferenceWidgetForMouseMove.isVisible()) {
                return this.editPreferenceWidgetForMouseMove;
            }
            if (this.editPreferenceWidgetForCursorPosition.getLine() === line && this.editPreferenceWidgetForCursorPosition.isVisible()) {
                return this.editPreferenceWidgetForCursorPosition;
            }
        }
        return undefined;
    }
    toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent) {
        const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
        if (settings && settings.length) {
            this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
        }
        else {
            this.editPreferenceWidgetForMouseMove.hide();
        }
    }
    showEditPreferencesWidget(editPreferencesWidget, settings) {
        const line = settings[0].valueRange.startLineNumber;
        if (this.editor.getOption(66 /* EditorOption.glyphMargin */) && this.marginFreeFromOtherDecorations(line)) {
            editPreferencesWidget.show(line, nls.localize('editTtile', "Edit"), settings);
            const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCursorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCursorPosition;
            editPreferenceWidgetToHide.hide();
        }
    }
    marginFreeFromOtherDecorations(line) {
        const decorations = this.editor.getLineDecorations(line);
        if (decorations) {
            for (const { options } of decorations) {
                if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf(ThemeIcon.asClassName(settingsEditIcon)) === -1) {
                    return false;
                }
            }
        }
        return true;
    }
    getSettings(lineNumber) {
        const configurationMap = this.getConfigurationsMap();
        return this.getSettingsAtLineNumber(lineNumber).filter(setting => {
            const configurationNode = configurationMap[setting.key];
            if (configurationNode) {
                if (configurationNode.policy && this.configurationService.inspect(setting.key).policyValue !== undefined) {
                    return false;
                }
                if (this.isDefaultSettings()) {
                    if (setting.key === 'launch') {
                        // Do not show because of https://github.com/microsoft/vscode/issues/32593
                        return false;
                    }
                    return true;
                }
                if (configurationNode.type === 'boolean' || configurationNode.enum) {
                    if (this.primarySettingsModel.configurationTarget !== 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
                        return true;
                    }
                    if (configurationNode.scope === 5 /* ConfigurationScope.RESOURCE */ || configurationNode.scope === 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */) {
                        return true;
                    }
                }
            }
            return false;
        });
    }
    getSettingsAtLineNumber(lineNumber) {
        // index of setting, across all groups/sections
        let index = 0;
        const settings = [];
        for (const group of this.settingsGroups) {
            if (group.range.startLineNumber > lineNumber) {
                break;
            }
            if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
                for (const section of group.sections) {
                    for (const setting of section.settings) {
                        if (setting.range.startLineNumber > lineNumber) {
                            break;
                        }
                        if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
                            if (!this.isDefaultSettings() && setting.overrides.length) {
                                // Only one level because override settings cannot have override settings
                                for (const overrideSetting of setting.overrides) {
                                    if (lineNumber >= overrideSetting.range.startLineNumber && lineNumber <= overrideSetting.range.endLineNumber) {
                                        settings.push({ ...overrideSetting, index, groupId: group.id });
                                    }
                                }
                            }
                            else {
                                settings.push({ ...setting, index, groupId: group.id });
                            }
                        }
                        index++;
                    }
                }
            }
        }
        return settings;
    }
    onMouseOver(editPreferenceWidget) {
        this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
    }
    onEditSettingClicked(editPreferenceWidget, e) {
        EventHelper.stop(e.event, true);
        const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key])
            : editPreferenceWidget.preferences.map(setting => new SubmenuAction(`preferences.submenu.${setting.key}`, setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.event,
            getActions: () => actions
        });
    }
    activateOnSetting(setting) {
        const startLine = setting.keyRange.startLineNumber;
        const settings = this.getSettings(startLine);
        if (!settings.length) {
            return false;
        }
        this.editPreferenceWidgetForMouseMove.show(startLine, '', settings);
        const actions = this.getActions(this.editPreferenceWidgetForMouseMove.preferences[0], this.getConfigurationsMap()[this.editPreferenceWidgetForMouseMove.preferences[0].key]);
        this.contextMenuService.showContextMenu({
            getAnchor: () => this.toAbsoluteCoords(new Position(startLine, 1)),
            getActions: () => actions
        });
        return true;
    }
    toAbsoluteCoords(position) {
        const positionCoords = this.editor.getScrolledVisiblePosition(position);
        const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
        const x = editorCoords.left + positionCoords.left;
        const y = editorCoords.top + positionCoords.top + positionCoords.height;
        return { x, y: y + 10 };
    }
    getConfigurationsMap() {
        return Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    }
    getActions(setting, jsonSchema) {
        if (jsonSchema.type === 'boolean') {
            return [{
                    id: 'truthyValue',
                    label: 'true',
                    tooltip: 'true',
                    enabled: true,
                    run: () => this.updateSetting(setting.key, true, setting),
                    class: undefined
                }, {
                    id: 'falsyValue',
                    label: 'false',
                    tooltip: 'false',
                    enabled: true,
                    run: () => this.updateSetting(setting.key, false, setting),
                    class: undefined
                }];
        }
        if (jsonSchema.enum) {
            return jsonSchema.enum.map(value => {
                return {
                    id: value,
                    label: JSON.stringify(value),
                    tooltip: JSON.stringify(value),
                    enabled: true,
                    run: () => this.updateSetting(setting.key, value, setting),
                    class: undefined
                };
            });
        }
        return this.getDefaultActions(setting);
    }
    getDefaultActions(setting) {
        if (this.isDefaultSettings()) {
            const settingInOtherModel = this.associatedPreferencesModel.getPreference(setting.key);
            return [{
                    id: 'setDefaultValue',
                    label: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
                    tooltip: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
                    enabled: true,
                    run: () => this.updateSetting(setting.key, setting.value, setting),
                    class: undefined
                }];
        }
        return [];
    }
    updateSetting(key, value, source) {
        this._onUpdateSetting.fire({ key, value, source });
    }
};
EditSettingRenderer = __decorate([
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IContextMenuService)
], EditSettingRenderer);
let SettingHighlighter = class SettingHighlighter extends Disposable {
    constructor(editor, instantiationService) {
        super();
        this.editor = editor;
        this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
        this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
    }
    highlight(setting, fix = false) {
        this.volatileHighlighter.removeHighlightRange();
        this.fixedHighlighter.removeHighlightRange();
        const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
        highlighter.highlightRange({
            range: setting.valueRange,
            resource: this.editor.getModel().uri
        }, this.editor);
        this.editor.revealLineInCenterIfOutsideViewport(setting.valueRange.startLineNumber, 0 /* editorCommon.ScrollType.Smooth */);
    }
    clear(fix = false) {
        this.volatileHighlighter.removeHighlightRange();
        if (fix) {
            this.fixedHighlighter.removeHighlightRange();
        }
    }
};
SettingHighlighter = __decorate([
    __param(1, IInstantiationService)
], SettingHighlighter);
let UnsupportedSettingsRenderer = class UnsupportedSettingsRenderer extends Disposable {
    constructor(editor, settingsEditorModel, markerService, environmentService, configurationService, workspaceTrustManagementService, uriIdentityService, languageFeaturesService, userDataProfileService, userDataProfilesService) {
        super();
        this.editor = editor;
        this.settingsEditorModel = settingsEditorModel;
        this.markerService = markerService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.uriIdentityService = uriIdentityService;
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.renderingDelayer = this._register(new Delayer(200));
        this.codeActions = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
        this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.source === 7 /* ConfigurationTarget.DEFAULT */)(() => this.delayedRender()));
        this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
        this._register(userDataProfileService.onDidChangeCurrentProfile(() => this.delayedRender()));
    }
    delayedRender() {
        this.renderingDelayer.trigger(() => this.render());
    }
    render() {
        this.codeActions.clear();
        const markerData = this.generateMarkerData();
        if (markerData.length) {
            this.markerService.changeOne('UnsupportedSettingsRenderer', this.settingsEditorModel.uri, markerData);
        }
        else {
            this.markerService.remove('UnsupportedSettingsRenderer', [this.settingsEditorModel.uri]);
        }
    }
    async provideCodeActions(model, range, context, token) {
        const actions = [];
        const codeActionsByRange = this.codeActions.get(model.uri);
        if (codeActionsByRange) {
            for (const [codeActionsRange, codeActions] of codeActionsByRange) {
                if (codeActionsRange.containsRange(range)) {
                    actions.push(...codeActions);
                }
            }
        }
        return {
            actions,
            dispose: () => { }
        };
    }
    generateMarkerData() {
        const markerData = [];
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
        for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
            for (const section of settingsGroup.sections) {
                for (const setting of section.settings) {
                    if (OVERRIDE_PROPERTY_REGEX.test(setting.key)) {
                        if (setting.overrides) {
                            this.handleOverrides(setting.overrides, configurationRegistry, markerData);
                        }
                        continue;
                    }
                    const configuration = configurationRegistry[setting.key];
                    if (configuration) {
                        this.handleUnstableSettingConfiguration(setting, configuration, markerData);
                        if (this.handlePolicyConfiguration(setting, configuration, markerData)) {
                            continue;
                        }
                        switch (this.settingsEditorModel.configurationTarget) {
                            case 3 /* ConfigurationTarget.USER_LOCAL */:
                                this.handleLocalUserConfiguration(setting, configuration, markerData);
                                break;
                            case 4 /* ConfigurationTarget.USER_REMOTE */:
                                this.handleRemoteUserConfiguration(setting, configuration, markerData);
                                break;
                            case 5 /* ConfigurationTarget.WORKSPACE */:
                                this.handleWorkspaceConfiguration(setting, configuration, markerData);
                                break;
                            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                                this.handleWorkspaceFolderConfiguration(setting, configuration, markerData);
                                break;
                        }
                    }
                    else {
                        markerData.push(this.generateUnknownConfigurationMarker(setting));
                    }
                }
            }
        }
        return markerData;
    }
    handlePolicyConfiguration(setting, configuration, markerData) {
        if (!configuration.policy) {
            return false;
        }
        if (this.configurationService.inspect(setting.key).policyValue === undefined) {
            return false;
        }
        if (this.settingsEditorModel.configurationTarget === 7 /* ConfigurationTarget.DEFAULT */) {
            return false;
        }
        markerData.push({
            severity: MarkerSeverity.Hint,
            tags: [1 /* MarkerTag.Unnecessary */],
            ...setting.range,
            message: nls.localize('unsupportedPolicySetting', "This setting cannot be applied because it is configured in the system policy.")
        });
        return true;
    }
    handleOverrides(overrides, configurationRegistry, markerData) {
        for (const setting of overrides || []) {
            const configuration = configurationRegistry[setting.key];
            if (configuration) {
                if (configuration.scope !== 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */) {
                    markerData.push({
                        severity: MarkerSeverity.Hint,
                        tags: [1 /* MarkerTag.Unnecessary */],
                        ...setting.range,
                        message: nls.localize('unsupportLanguageOverrideSetting', "This setting cannot be applied because it is not registered as language override setting.")
                    });
                }
            }
            else {
                markerData.push(this.generateUnknownConfigurationMarker(setting));
            }
        }
    }
    handleLocalUserConfiguration(setting, configuration, markerData) {
        if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
            if (isEqual(this.userDataProfilesService.defaultProfile.settingsResource, this.settingsEditorModel.uri) && !this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
                // If we're in the default profile setting file, and the setting cannot be applied in all profiles
                markerData.push({
                    severity: MarkerSeverity.Hint,
                    tags: [1 /* MarkerTag.Unnecessary */],
                    ...setting.range,
                    message: nls.localize('defaultProfileSettingWhileNonDefaultActive', "This setting cannot be applied while a non-default profile is active. It will be applied when the default profile is active.")
                });
            }
            else if (isEqual(this.userDataProfileService.currentProfile.settingsResource, this.settingsEditorModel.uri)) {
                if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
                    // If we're in a profile setting file, and the setting is application-scoped, fade it out.
                    markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
                }
                else if (this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
                    // If we're in the non-default profile setting file, and the setting can be applied in all profiles, fade it out.
                    markerData.push({
                        severity: MarkerSeverity.Hint,
                        tags: [1 /* MarkerTag.Unnecessary */],
                        ...setting.range,
                        message: nls.localize('allProfileSettingWhileInNonDefaultProfileSetting', "This setting cannot be applied because it is configured to be applied in all profiles using setting {0}. Value from the default profile will be used instead.", APPLY_ALL_PROFILES_SETTING)
                    });
                }
            }
        }
        if (this.environmentService.remoteAuthority && (configuration.scope === 2 /* ConfigurationScope.MACHINE */ || configuration.scope === 3 /* ConfigurationScope.APPLICATION_MACHINE */ || configuration.scope === 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */)) {
            markerData.push({
                severity: MarkerSeverity.Hint,
                tags: [1 /* MarkerTag.Unnecessary */],
                ...setting.range,
                message: nls.localize('unsupportedRemoteMachineSetting', "This setting cannot be applied in this window. It will be applied when you open a local window.")
            });
        }
    }
    handleRemoteUserConfiguration(setting, configuration, markerData) {
        if (configuration.scope === 1 /* ConfigurationScope.APPLICATION */) {
            markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
        }
    }
    handleWorkspaceConfiguration(setting, configuration, markerData) {
        if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
            markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
        }
        if (configuration.scope === 2 /* ConfigurationScope.MACHINE */) {
            markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
        }
        if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
            const marker = this.generateUntrustedSettingMarker(setting);
            markerData.push(marker);
            const codeActions = this.generateUntrustedSettingCodeActions([marker]);
            this.addCodeActions(marker, codeActions);
        }
    }
    handleWorkspaceFolderConfiguration(setting, configuration, markerData) {
        if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
            markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
        }
        if (configuration.scope === 2 /* ConfigurationScope.MACHINE */) {
            markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
        }
        if (configuration.scope === 4 /* ConfigurationScope.WINDOW */) {
            markerData.push({
                severity: MarkerSeverity.Hint,
                tags: [1 /* MarkerTag.Unnecessary */],
                ...setting.range,
                message: nls.localize('unsupportedWindowSetting', "This setting cannot be applied in this workspace. It will be applied when you open the containing workspace folder directly.")
            });
        }
        if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
            const marker = this.generateUntrustedSettingMarker(setting);
            markerData.push(marker);
            const codeActions = this.generateUntrustedSettingCodeActions([marker]);
            this.addCodeActions(marker, codeActions);
        }
    }
    handleUnstableSettingConfiguration(setting, configuration, markerData) {
        if (configuration.tags?.includes('preview')) {
            markerData.push(this.generatePreviewSettingMarker(setting));
        }
        else if (configuration.tags?.includes('experimental')) {
            markerData.push(this.generateExperimentalSettingMarker(setting));
        }
    }
    generateUnsupportedApplicationSettingMarker(setting) {
        return {
            severity: MarkerSeverity.Hint,
            tags: [1 /* MarkerTag.Unnecessary */],
            ...setting.range,
            message: nls.localize('unsupportedApplicationSetting', "This setting has an application scope and can only be set in the settings file from the Default profile.")
        };
    }
    generateUnsupportedMachineSettingMarker(setting) {
        return {
            severity: MarkerSeverity.Hint,
            tags: [1 /* MarkerTag.Unnecessary */],
            ...setting.range,
            message: nls.localize('unsupportedMachineSetting', "This setting can only be applied in user settings in local window or in remote settings in remote window.")
        };
    }
    generateUntrustedSettingMarker(setting) {
        return {
            severity: MarkerSeverity.Warning,
            ...setting.range,
            message: nls.localize('untrustedSetting', "This setting can only be applied in a trusted workspace.")
        };
    }
    generateUnknownConfigurationMarker(setting) {
        return {
            severity: MarkerSeverity.Hint,
            tags: [1 /* MarkerTag.Unnecessary */],
            ...setting.range,
            message: nls.localize('unknown configuration setting', "Unknown Configuration Setting")
        };
    }
    generateUntrustedSettingCodeActions(diagnostics) {
        return [{
                title: nls.localize('manage workspace trust', "Manage Workspace Trust"),
                command: {
                    id: 'workbench.trust.manage',
                    title: nls.localize('manage workspace trust', "Manage Workspace Trust")
                },
                diagnostics,
                kind: CodeActionKind.QuickFix.value
            }];
    }
    generatePreviewSettingMarker(setting) {
        return {
            severity: MarkerSeverity.Hint,
            ...setting.range,
            message: PREVIEW_INDICATOR_DESCRIPTION
        };
    }
    generateExperimentalSettingMarker(setting) {
        return {
            severity: MarkerSeverity.Hint,
            ...setting.range,
            message: EXPERIMENTAL_INDICATOR_DESCRIPTION
        };
    }
    addCodeActions(range, codeActions) {
        let actions = this.codeActions.get(this.settingsEditorModel.uri);
        if (!actions) {
            actions = [];
            this.codeActions.set(this.settingsEditorModel.uri, actions);
        }
        actions.push([Range.lift(range), codeActions]);
    }
    dispose() {
        this.markerService.remove('UnsupportedSettingsRenderer', [this.settingsEditorModel.uri]);
        this.codeActions.clear();
        super.dispose();
    }
};
UnsupportedSettingsRenderer = __decorate([
    __param(2, IMarkerService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, IWorkbenchConfigurationService),
    __param(5, IWorkspaceTrustManagementService),
    __param(6, IUriIdentityService),
    __param(7, ILanguageFeaturesService),
    __param(8, IUserDataProfileService),
    __param(9, IUserDataProfilesService)
], UnsupportedSettingsRenderer);
let McpSettingsRenderer = class McpSettingsRenderer extends Disposable {
    constructor(editor, settingsEditorModel, markerService, uriIdentityService, languageFeaturesService) {
        super();
        this.editor = editor;
        this.settingsEditorModel = settingsEditorModel;
        this.markerService = markerService;
        this.uriIdentityService = uriIdentityService;
        this.renderingDelayer = this._register(new Delayer(200));
        this.codeActions = new ResourceMap(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
        this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
        this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
    }
    delayedRender() {
        this.renderingDelayer.trigger(() => this.render());
    }
    render() {
        this.codeActions.clear();
        const markerData = this.generateMarkerData();
        if (markerData.length) {
            this.markerService.changeOne('McpSettingsRenderer', this.settingsEditorModel.uri, markerData);
        }
        else {
            this.markerService.remove('McpSettingsRenderer', [this.settingsEditorModel.uri]);
        }
    }
    async provideCodeActions(model, range, context, token) {
        const actions = [];
        const codeActionsByRange = this.codeActions.get(model.uri);
        if (codeActionsByRange) {
            for (const [codeActionsRange, codeActions] of codeActionsByRange) {
                if (codeActionsRange.containsRange(range)) {
                    actions.push(...codeActions);
                }
            }
        }
        return {
            actions,
            dispose: () => { }
        };
    }
    generateMarkerData() {
        const markerData = [];
        // Only check for MCP configuration in user local and user remote settings
        if (this.settingsEditorModel.configurationTarget !== 3 /* ConfigurationTarget.USER_LOCAL */ &&
            this.settingsEditorModel.configurationTarget !== 4 /* ConfigurationTarget.USER_REMOTE */) {
            return markerData;
        }
        for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
            for (const section of settingsGroup.sections) {
                for (const setting of section.settings) {
                    if (setting.key === mcpConfigurationSection) {
                        const marker = this.generateMcpConfigurationMarker(setting);
                        markerData.push(marker);
                        const codeActions = this.generateMcpConfigurationCodeActions([marker]);
                        this.addCodeActions(setting.range, codeActions);
                    }
                }
            }
        }
        return markerData;
    }
    generateMcpConfigurationMarker(setting) {
        const isRemote = this.settingsEditorModel.configurationTarget === 4 /* ConfigurationTarget.USER_REMOTE */;
        const message = isRemote
            ? nls.localize('mcp.renderer.remoteConfigFound', 'MCP servers should not be configured in remote user settings. Use the dedicated MCP configuration instead.')
            : nls.localize('mcp.renderer.userConfigFound', 'MCP servers should not be configured in user settings. Use the dedicated MCP configuration instead.');
        return {
            severity: MarkerSeverity.Warning,
            ...setting.range,
            message
        };
    }
    generateMcpConfigurationCodeActions(diagnostics) {
        const isRemote = this.settingsEditorModel.configurationTarget === 4 /* ConfigurationTarget.USER_REMOTE */;
        const openConfigLabel = isRemote
            ? nls.localize('mcp.renderer.openRemoteConfig', 'Open Remote User MCP Configuration')
            : nls.localize('mcp.renderer.openUserConfig', 'Open User MCP Configuration');
        const commandId = isRemote ? "workbench.mcp.openRemoteUserMcpJson" /* McpCommandIds.OpenRemoteUserMcp */ : "workbench.mcp.openUserMcpJson" /* McpCommandIds.OpenUserMcp */;
        return [{
                title: openConfigLabel,
                command: {
                    id: commandId,
                    title: openConfigLabel
                },
                diagnostics,
                kind: CodeActionKind.QuickFix.value
            }];
    }
    addCodeActions(range, codeActions) {
        let actions = this.codeActions.get(this.settingsEditorModel.uri);
        if (!actions) {
            actions = [];
            this.codeActions.set(this.settingsEditorModel.uri, actions);
        }
        actions.push([Range.lift(range), codeActions]);
    }
    dispose() {
        this.markerService.remove('McpSettingsRenderer', [this.settingsEditorModel.uri]);
        this.codeActions.clear();
        super.dispose();
    }
};
McpSettingsRenderer = __decorate([
    __param(2, IMarkerService),
    __param(3, IUriIdentityService),
    __param(4, ILanguageFeaturesService)
], McpSettingsRenderer);
let WorkspaceConfigurationRenderer = class WorkspaceConfigurationRenderer extends Disposable {
    static { WorkspaceConfigurationRenderer_1 = this; }
    static { this.supportedKeys = ['folders', 'tasks', 'launch', 'extensions', 'settings', 'remoteAuthority', 'transient']; }
    constructor(editor, workspaceSettingsEditorModel, workspaceContextService, markerService) {
        super();
        this.editor = editor;
        this.workspaceSettingsEditorModel = workspaceSettingsEditorModel;
        this.workspaceContextService = workspaceContextService;
        this.markerService = markerService;
        this.renderingDelayer = this._register(new Delayer(200));
        this.decorations = this.editor.createDecorationsCollection();
        this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
    }
    render() {
        const markerData = [];
        if (this.workspaceContextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ && this.workspaceSettingsEditorModel instanceof WorkspaceConfigurationEditorModel) {
            const ranges = [];
            for (const settingsGroup of this.workspaceSettingsEditorModel.configurationGroups) {
                for (const section of settingsGroup.sections) {
                    for (const setting of section.settings) {
                        if (!WorkspaceConfigurationRenderer_1.supportedKeys.includes(setting.key)) {
                            markerData.push({
                                severity: MarkerSeverity.Hint,
                                tags: [1 /* MarkerTag.Unnecessary */],
                                ...setting.range,
                                message: nls.localize('unsupportedProperty', "Unsupported Property")
                            });
                        }
                    }
                }
            }
            this.decorations.set(ranges.map(range => this.createDecoration(range)));
        }
        if (markerData.length) {
            this.markerService.changeOne('WorkspaceConfigurationRenderer', this.workspaceSettingsEditorModel.uri, markerData);
        }
        else {
            this.markerService.remove('WorkspaceConfigurationRenderer', [this.workspaceSettingsEditorModel.uri]);
        }
    }
    static { this._DIM_CONFIGURATION_ = ModelDecorationOptions.register({
        description: 'dim-configuration',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        inlineClassName: 'dim-configuration'
    }); }
    createDecoration(range) {
        return {
            range,
            options: WorkspaceConfigurationRenderer_1._DIM_CONFIGURATION_
        };
    }
    dispose() {
        this.markerService.remove('WorkspaceConfigurationRenderer', [this.workspaceSettingsEditorModel.uri]);
        this.decorations.clear();
        super.dispose();
    }
};
WorkspaceConfigurationRenderer = WorkspaceConfigurationRenderer_1 = __decorate([
    __param(2, IWorkspaceContextService),
    __param(3, IMarkerService)
], WorkspaceConfigurationRenderer);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNSZW5kZXJlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9icm93c2VyL3ByZWZlcmVuY2VzUmVuZGVyZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEYsT0FBTyxFQUFXLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUczRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBTXhFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4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