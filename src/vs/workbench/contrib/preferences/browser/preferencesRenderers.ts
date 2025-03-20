/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHelper, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { IAction, SubmenuAction } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ICursorPositionChangedEvent } from '../../../../editor/common/cursorEvents.js';
import * as editorCommon from '../../../../editor/common/editorCommon.js';
import * as languages from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import * as nls from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationPropertySchema, IConfigurationRegistry, IRegisteredConfigurationPropertySchema, OVERRIDE_PROPERTY_REGEX, overrideIdentifiersFromKey } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerData, IMarkerService, MarkerSeverity, MarkerTag } from '../../../../platform/markers/common/markers.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { RangeHighlightDecorations } from '../../../browser/codeeditor.js';
import { settingsEditIcon } from './preferencesIcons.js';
import { EditPreferenceWidget } from './preferencesWidgets.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPreferencesEditorModel, IPreferencesService, ISetting, ISettingsEditorModel, ISettingsGroup } from '../../../services/preferences/common/preferences.js';
import { DefaultSettingsEditorModel, SettingsEditorModel, WorkspaceConfigurationEditorModel } from '../../../services/preferences/common/preferencesModels.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { EXPERIMENTAL_INDICATOR_DESCRIPTION, PREVIEW_INDICATOR_DESCRIPTION } from '../common/preferences.js';

export interface IPreferencesRenderer extends IDisposable {
	render(): void;
	updatePreference(key: string, value: any, source: ISetting): void;
	focusPreference(setting: ISetting): void;
	clearFocus(setting: ISetting): void;
	editPreference(setting: ISetting): boolean;
}

export class UserSettingsRenderer extends Disposable implements IPreferencesRenderer {

	private settingHighlighter: SettingHighlighter;
	private editSettingActionRenderer: EditSettingRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);
	private associatedPreferencesModel!: IPreferencesEditorModel<ISetting>;

	private unsupportedSettingsRenderer: UnsupportedSettingsRenderer;

	constructor(protected editor: ICodeEditor, readonly preferencesModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
		this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this.updatePreference(key, value, source)));
		this._register(this.editor.getModel()!.onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
		this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
	}

	render(): void {
		this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this.associatedPreferencesModel);
		this.unsupportedSettingsRenderer.render();
	}

	updatePreference(key: string, value: any, source: IIndexedSetting): void {
		const overrideIdentifiers = source.overrideOf ? overrideIdentifiersFromKey(source.overrideOf.key) : null;
		const resource = this.preferencesModel.uri;
		this.configurationService.updateValue(key, value, { overrideIdentifiers, resource }, this.preferencesModel.configurationTarget)
			.then(() => this.onSettingUpdated(source));
	}

	private onModelChanged(): void {
		if (!this.editor.hasModel()) {
			// model could have been disposed during the delay
			return;
		}
		this.render();
	}

	private onSettingUpdated(setting: ISetting) {
		this.editor.focus();
		setting = this.getSetting(setting)!;
		if (setting) {
			// TODO:@sandy Selection range should be template range
			this.editor.setSelection(setting.valueRange);
			this.settingHighlighter.highlight(setting, true);
		}
	}

	private getSetting(setting: ISetting): ISetting | undefined {
		const { key, overrideOf } = setting;
		if (overrideOf) {
			const setting = this.getSetting(overrideOf);
			for (const override of setting!.overrides!) {
				if (override.key === key) {
					return override;
				}
			}
			return undefined;
		}

		return this.preferencesModel.getPreference(key);
	}

	focusPreference(setting: ISetting): void {
		const s = this.getSetting(setting);
		if (s) {
			this.settingHighlighter.highlight(s, true);
			this.editor.setPosition({ lineNumber: s.keyRange.startLineNumber, column: s.keyRange.startColumn });
		} else {
			this.settingHighlighter.clear(true);
		}
	}

	clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}

	editPreference(setting: ISetting): boolean {
		const editableSetting = this.getSetting(setting);
		return !!(editableSetting && this.editSettingActionRenderer.activateOnSetting(editableSetting));
	}

}

export class WorkspaceSettingsRenderer extends UserSettingsRenderer implements IPreferencesRenderer {

	private workspaceConfigurationRenderer: WorkspaceConfigurationRenderer;

	constructor(editor: ICodeEditor, preferencesModel: SettingsEditorModel,
		@IPreferencesService preferencesService: IPreferencesService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
		this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
	}

	override render(): void {
		super.render();
		this.workspaceConfigurationRenderer.render();
	}
}

export interface IIndexedSetting extends ISetting {
	index: number;
	groupId: string;
}

class EditSettingRenderer extends Disposable {

	private editPreferenceWidgetForCursorPosition: EditPreferenceWidget<IIndexedSetting>;
	private editPreferenceWidgetForMouseMove: EditPreferenceWidget<IIndexedSetting>;

	private settingsGroups: ISettingsGroup[] = [];
	associatedPreferencesModel!: IPreferencesEditorModel<ISetting>;
	private toggleEditPreferencesForMouseMoveDelayer: Delayer<void>;

	private readonly _onUpdateSetting: Emitter<{ key: string; value: any; source: IIndexedSetting }> = this._register(new Emitter<{ key: string; value: any; source: IIndexedSetting }>());
	readonly onUpdateSetting: Event<{ key: string; value: any; source: IIndexedSetting }> = this._onUpdateSetting.event;

	constructor(private editor: ICodeEditor, private primarySettingsModel: ISettingsEditorModel,
		private settingHighlighter: SettingHighlighter,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();

		this.editPreferenceWidgetForCursorPosition = this._register(this.instantiationService.createInstance(EditPreferenceWidget<IIndexedSetting>, editor));
		this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance(EditPreferenceWidget<IIndexedSetting>, editor));
		this.toggleEditPreferencesForMouseMoveDelayer = new Delayer<void>(75);

		this._register(this.editPreferenceWidgetForCursorPosition.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForCursorPosition, e)));
		this._register(this.editPreferenceWidgetForMouseMove.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));

		this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
		this._register(this.editor.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
		this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
	}

	render(settingsGroups: ISettingsGroup[], associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		this.editPreferenceWidgetForCursorPosition.hide();
		this.editPreferenceWidgetForMouseMove.hide();
		this.settingsGroups = settingsGroups;
		this.associatedPreferencesModel = associatedPreferencesModel;

		const settings = this.getSettings(this.editor.getPosition()!.lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
		}
	}

	private isDefaultSettings(): boolean {
		return this.primarySettingsModel instanceof DefaultSettingsEditorModel;
	}

	private onConfigurationChanged(): void {
		if (!this.editor.getOption(EditorOption.glyphMargin)) {
			this.editPreferenceWidgetForCursorPosition.hide();
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private onPositionChanged(positionChangeEvent: ICursorPositionChangedEvent) {
		this.editPreferenceWidgetForMouseMove.hide();
		const settings = this.getSettings(positionChangeEvent.position.lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
		} else {
			this.editPreferenceWidgetForCursorPosition.hide();
		}
	}

	private onMouseMoved(mouseMoveEvent: IEditorMouseEvent): void {
		const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
		if (editPreferenceWidget) {
			this.onMouseOver(editPreferenceWidget);
			return;
		}
		this.settingHighlighter.clear();
		this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent));
	}

	private getEditPreferenceWidgetUnderMouse(mouseMoveEvent: IEditorMouseEvent): EditPreferenceWidget<ISetting> | undefined {
		if (mouseMoveEvent.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
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

	private toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent: IEditorMouseEvent): void {
		const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
		if (settings && settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
		} else {
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private showEditPreferencesWidget(editPreferencesWidget: EditPreferenceWidget<ISetting>, settings: IIndexedSetting[]) {
		const line = settings[0].valueRange.startLineNumber;
		if (this.editor.getOption(EditorOption.glyphMargin) && this.marginFreeFromOtherDecorations(line)) {
			editPreferencesWidget.show(line, nls.localize('editTtile', "Edit"), settings);
			const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCursorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCursorPosition;
			editPreferenceWidgetToHide.hide();
		}
	}

	private marginFreeFromOtherDecorations(line: number): boolean {
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

	private getSettings(lineNumber: number): IIndexedSetting[] {
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
					if ((<SettingsEditorModel>this.primarySettingsModel).configurationTarget !== ConfigurationTarget.WORKSPACE_FOLDER) {
						return true;
					}
					if (configurationNode.scope === ConfigurationScope.RESOURCE || configurationNode.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
						return true;
					}
				}
			}
			return false;
		});
	}

	private getSettingsAtLineNumber(lineNumber: number): IIndexedSetting[] {
		// index of setting, across all groups/sections
		let index = 0;

		const settings: IIndexedSetting[] = [];
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
							if (!this.isDefaultSettings() && setting.overrides!.length) {
								// Only one level because override settings cannot have override settings
								for (const overrideSetting of setting.overrides!) {
									if (lineNumber >= overrideSetting.range.startLineNumber && lineNumber <= overrideSetting.range.endLineNumber) {
										settings.push({ ...overrideSetting, index, groupId: group.id });
									}
								}
							} else {
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

	private onMouseOver(editPreferenceWidget: EditPreferenceWidget<ISetting>): void {
		this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
	}

	private onEditSettingClicked(editPreferenceWidget: EditPreferenceWidget<IIndexedSetting>, e: IEditorMouseEvent): void {
		EventHelper.stop(e.event, true);

		const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key])
			: editPreferenceWidget.preferences.map(setting => new SubmenuAction(`preferences.submenu.${setting.key}`, setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.event,
			getActions: () => actions
		});
	}

	activateOnSetting(setting: ISetting): boolean {
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

	private toAbsoluteCoords(position: Position): { x: number; y: number } {
		const positionCoords = this.editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this.editor.getDomNode()!);
		const x = editorCoords.left + positionCoords!.left;
		const y = editorCoords.top + positionCoords!.top + positionCoords!.height;

		return { x, y: y + 10 };
	}

	private getConfigurationsMap(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	}

	private getActions(setting: IIndexedSetting, jsonSchema: IJSONSchema): IAction[] {
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

	private getDefaultActions(setting: IIndexedSetting): IAction[] {
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

	private updateSetting(key: string, value: any, source: IIndexedSetting): void {
		this._onUpdateSetting.fire({ key, value, source });
	}
}

class SettingHighlighter extends Disposable {

	private fixedHighlighter: RangeHighlightDecorations;
	private volatileHighlighter: RangeHighlightDecorations;

	constructor(private editor: ICodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
	}

	highlight(setting: ISetting, fix: boolean = false) {
		this.volatileHighlighter.removeHighlightRange();
		this.fixedHighlighter.removeHighlightRange();

		const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
		highlighter.highlightRange({
			range: setting.valueRange,
			resource: this.editor.getModel()!.uri
		}, this.editor);

		this.editor.revealLineInCenterIfOutsideViewport(setting.valueRange.startLineNumber, editorCommon.ScrollType.Smooth);
	}

	clear(fix: boolean = false): void {
		this.volatileHighlighter.removeHighlightRange();
		if (fix) {
			this.fixedHighlighter.removeHighlightRange();
		}
	}
}

class UnsupportedSettingsRenderer extends Disposable implements languages.CodeActionProvider {

	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	private readonly codeActions = new ResourceMap<[Range, languages.CodeAction[]][]>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));

	constructor(
		private readonly editor: ICodeEditor,
		private readonly settingsEditorModel: SettingsEditorModel,
		@IMarkerService private readonly markerService: IMarkerService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this._register(this.editor.getModel()!.onDidChangeContent(() => this.delayedRender()));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.source === ConfigurationTarget.DEFAULT)(() => this.delayedRender()));
		this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
		this._register(userDataProfileService.onDidChangeCurrentProfile(() => this.delayedRender()));
	}

	private delayedRender(): void {
		this.renderingDelayer.trigger(() => this.render());
	}

	public render(): void {
		this.codeActions.clear();
		const markerData: IMarkerData[] = this.generateMarkerData();
		if (markerData.length) {
			this.markerService.changeOne('UnsupportedSettingsRenderer', this.settingsEditorModel.uri, markerData);
		} else {
			this.markerService.remove('UnsupportedSettingsRenderer', [this.settingsEditorModel.uri]);
		}
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection, context: languages.CodeActionContext, token: CancellationToken): Promise<languages.CodeActionList> {
		const actions: languages.CodeAction[] = [];
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

	private generateMarkerData(): IMarkerData[] {
		const markerData: IMarkerData[] = [];
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
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
							case ConfigurationTarget.USER_LOCAL:
								this.handleLocalUserConfiguration(setting, configuration, markerData);
								break;
							case ConfigurationTarget.USER_REMOTE:
								this.handleRemoteUserConfiguration(setting, configuration, markerData);
								break;
							case ConfigurationTarget.WORKSPACE:
								this.handleWorkspaceConfiguration(setting, configuration, markerData);
								break;
							case ConfigurationTarget.WORKSPACE_FOLDER:
								this.handleWorkspaceFolderConfiguration(setting, configuration, markerData);
								break;
						}
					} else {
						markerData.push(this.generateUnknownConfigurationMarker(setting));
					}
				}
			}
		}
		return markerData;
	}

	private handlePolicyConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): boolean {
		if (!configuration.policy) {
			return false;
		}
		if (this.configurationService.inspect(setting.key).policyValue === undefined) {
			return false;
		}
		if (this.settingsEditorModel.configurationTarget === ConfigurationTarget.DEFAULT) {
			return false;
		}
		markerData.push({
			severity: MarkerSeverity.Hint,
			tags: [MarkerTag.Unnecessary],
			...setting.range,
			message: nls.localize('unsupportedPolicySetting', "This setting cannot be applied because it is configured in the system policy.")
		});
		return true;
	}

	private handleOverrides(overrides: ISetting[], configurationRegistry: IStringDictionary<IRegisteredConfigurationPropertySchema>, markerData: IMarkerData[]): void {
		for (const setting of overrides || []) {
			const configuration = configurationRegistry[setting.key];
			if (configuration) {
				if (configuration.scope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
					markerData.push({
						severity: MarkerSeverity.Hint,
						tags: [MarkerTag.Unnecessary],
						...setting.range,
						message: nls.localize('unsupportLanguageOverrideSetting', "This setting cannot be applied because it is not registered as language override setting.")
					});
				}
			} else {
				markerData.push(this.generateUnknownConfigurationMarker(setting));
			}
		}
	}

	private handleLocalUserConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): void {
		if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
			if (isEqual(this.userDataProfilesService.defaultProfile.settingsResource, this.settingsEditorModel.uri) && !this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
				// If we're in the default profile setting file, and the setting cannot be applied in all profiles
				markerData.push({
					severity: MarkerSeverity.Hint,
					tags: [MarkerTag.Unnecessary],
					...setting.range,
					message: nls.localize('defaultProfileSettingWhileNonDefaultActive', "This setting cannot be applied while a non-default profile is active. It will be applied when the default profile is active.")
				});
			} else if (isEqual(this.userDataProfileService.currentProfile.settingsResource, this.settingsEditorModel.uri)) {
				if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
					// If we're in a profile setting file, and the setting is application-scoped, fade it out.
					markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
				} else if (this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
					// If we're in the non-default profile setting file, and the setting can be applied in all profiles, fade it out.
					markerData.push({
						severity: MarkerSeverity.Hint,
						tags: [MarkerTag.Unnecessary],
						...setting.range,
						message: nls.localize('allProfileSettingWhileInNonDefaultProfileSetting', "This setting cannot be applied because it is configured to be applied in all profiles using setting {0}. Value from the default profile will be used instead.", APPLY_ALL_PROFILES_SETTING)
					});
				}
			}
		}
		if (this.environmentService.remoteAuthority && (configuration.scope === ConfigurationScope.MACHINE || configuration.scope === ConfigurationScope.APPLICATION_MACHINE || configuration.scope === ConfigurationScope.MACHINE_OVERRIDABLE)) {
			markerData.push({
				severity: MarkerSeverity.Hint,
				tags: [MarkerTag.Unnecessary],
				...setting.range,
				message: nls.localize('unsupportedRemoteMachineSetting', "This setting cannot be applied in this window. It will be applied when you open a local window.")
			});
		}
	}

	private handleRemoteUserConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): void {
		if (configuration.scope === ConfigurationScope.APPLICATION) {
			markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
		}
	}

	private handleWorkspaceConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): void {
		if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
			markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
		}

		if (configuration.scope === ConfigurationScope.MACHINE) {
			markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
		}

		if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
			const marker = this.generateUntrustedSettingMarker(setting);
			markerData.push(marker);
			const codeActions = this.generateUntrustedSettingCodeActions([marker]);
			this.addCodeActions(marker, codeActions);
		}
	}

	private handleWorkspaceFolderConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): void {
		if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
			markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
		}

		if (configuration.scope === ConfigurationScope.MACHINE) {
			markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
		}

		if (configuration.scope === ConfigurationScope.WINDOW) {
			markerData.push({
				severity: MarkerSeverity.Hint,
				tags: [MarkerTag.Unnecessary],
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

	private handleUnstableSettingConfiguration(setting: ISetting, configuration: IConfigurationPropertySchema, markerData: IMarkerData[]): void {
		if (configuration.tags?.includes('preview')) {
			markerData.push(this.generatePreviewSettingMarker(setting));
		} else if (configuration.tags?.includes('experimental')) {
			markerData.push(this.generateExperimentalSettingMarker(setting));
		}
	}

	private generateUnsupportedApplicationSettingMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Hint,
			tags: [MarkerTag.Unnecessary],
			...setting.range,
			message: nls.localize('unsupportedApplicationSetting', "This setting has an application scope and can be set only in the user settings file.")
		};
	}

	private generateUnsupportedMachineSettingMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Hint,
			tags: [MarkerTag.Unnecessary],
			...setting.range,
			message: nls.localize('unsupportedMachineSetting', "This setting can only be applied in user settings in local window or in remote settings in remote window.")
		};
	}

	private generateUntrustedSettingMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Warning,
			...setting.range,
			message: nls.localize('untrustedSetting', "This setting can only be applied in a trusted workspace.")
		};
	}

	private generateUnknownConfigurationMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Hint,
			tags: [MarkerTag.Unnecessary],
			...setting.range,
			message: nls.localize('unknown configuration setting', "Unknown Configuration Setting")
		};
	}

	private generateUntrustedSettingCodeActions(diagnostics: IMarkerData[]): languages.CodeAction[] {
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

	private generatePreviewSettingMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Hint,
			...setting.range,
			message: PREVIEW_INDICATOR_DESCRIPTION
		};
	}

	private generateExperimentalSettingMarker(setting: ISetting): IMarkerData {
		return {
			severity: MarkerSeverity.Hint,
			...setting.range,
			message: EXPERIMENTAL_INDICATOR_DESCRIPTION
		};
	}

	private addCodeActions(range: IRange, codeActions: languages.CodeAction[]): void {
		let actions = this.codeActions.get(this.settingsEditorModel.uri);
		if (!actions) {
			actions = [];
			this.codeActions.set(this.settingsEditorModel.uri, actions);
		}
		actions.push([Range.lift(range), codeActions]);
	}

	public override dispose(): void {
		this.markerService.remove('UnsupportedSettingsRenderer', [this.settingsEditorModel.uri]);
		this.codeActions.clear();
		super.dispose();
	}

}

class WorkspaceConfigurationRenderer extends Disposable {
	private static readonly supportedKeys = ['folders', 'tasks', 'launch', 'extensions', 'settings', 'remoteAuthority', 'transient'];

	private readonly decorations: editorCommon.IEditorDecorationsCollection;
	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(private editor: ICodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IMarkerService private readonly markerService: IMarkerService
	) {
		super();
		this.decorations = this.editor.createDecorationsCollection();
		this._register(this.editor.getModel()!.onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
	}

	render(): void {
		const markerData: IMarkerData[] = [];
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceSettingsEditorModel instanceof WorkspaceConfigurationEditorModel) {
			const ranges: IRange[] = [];
			for (const settingsGroup of this.workspaceSettingsEditorModel.configurationGroups) {
				for (const section of settingsGroup.sections) {
					for (const setting of section.settings) {
						if (!WorkspaceConfigurationRenderer.supportedKeys.includes(setting.key)) {
							markerData.push({
								severity: MarkerSeverity.Hint,
								tags: [MarkerTag.Unnecessary],
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
		} else {
			this.markerService.remove('WorkspaceConfigurationRenderer', [this.workspaceSettingsEditorModel.uri]);
		}
	}

	private static readonly _DIM_CONFIGURATION_ = ModelDecorationOptions.register({
		description: 'dim-configuration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'dim-configuration'
	});

	private createDecoration(range: IRange): IModelDeltaDecoration {
		return {
			range,
			options: WorkspaceConfigurationRenderer._DIM_CONFIGURATION_
		};
	}

	override dispose(): void {
		this.markerService.remove('WorkspaceConfigurationRenderer', [this.workspaceSettingsEditorModel.uri]);
		this.decorations.clear();
		super.dispose();
	}
}
