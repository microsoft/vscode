/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Event, Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPreferencesService, ISettingsGroup, ISetting, IPreferencesEditorModel, IFilterResult, ISettingsEditorModel, IExtensionSetting, IScoredResults } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel, WorkspaceConfigurationEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SettingsGroupTitleWidget, EditPreferenceWidget, SettingsHeaderWidget, DefaultSettingsHeaderWidget, FloatingClickWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { RangeHighlightDecorations } from 'vs/workbench/browser/parts/editor/rangeDecorations';
import { IMarkerService, IMarkerData, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { overrideIdentifierFromKey, IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextModel, IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { CodeLensProviderRegistry, CodeLensProvider, ICodeLensSymbol } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { IssueType, ISettingsSearchIssueReporterData, ISettingSearchResult } from 'vs/platform/issue/common/issue';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ContextSubMenu } from 'vs/base/browser/contextmenu';
import { IWorkbenchSettingsConfiguration } from 'vs/workbench/parts/preferences/common/preferences';

export interface IPreferencesRenderer<T> extends IDisposable {
	readonly preferencesModel: IPreferencesEditorModel<T>;

	getAssociatedPreferencesModel(): IPreferencesEditorModel<T>;
	setAssociatedPreferencesModel(associatedPreferencesModel: IPreferencesEditorModel<T>): void;

	onFocusPreference: Event<T>;
	onClearFocusPreference: Event<T>;
	onUpdatePreference?: Event<{ key: string, value: any, source: T }>;

	render(): void;
	updatePreference(key: string, value: any, source: T): void;
	focusPreference(setting: T): void;
	clearFocus(setting: T): void;
	filterPreferences(filterResult: IFilterResult): void;
	editPreference(setting: T): boolean;
}

export class UserSettingsRenderer extends Disposable implements IPreferencesRenderer<ISetting> {

	private settingHighlighter: SettingHighlighter;
	private editSettingActionRenderer: EditSettingRenderer;
	private highlightMatchesRenderer: HighlightMatchesRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);
	private associatedPreferencesModel: IPreferencesEditorModel<ISetting>;

	private readonly _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private readonly _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	private readonly _onUpdatePreference: Emitter<{ key: string, value: any, source: IIndexedSetting }> = new Emitter<{ key: string, value: any, source: IIndexedSetting }>();
	public readonly onUpdatePreference: Event<{ key: string, value: any, source: IIndexedSetting }> = this._onUpdatePreference.event;

	private filterResult: IFilterResult;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: SettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.highlightMatchesRenderer = this._register(instantiationService.createInstance(HighlightMatchesRenderer, editor));
		this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this._updatePreference(key, value, source)));
		this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));

		this.createHeader();
	}

	public getAssociatedPreferencesModel(): IPreferencesEditorModel<ISetting> {
		return this.associatedPreferencesModel;
	}

	public setAssociatedPreferencesModel(associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		this.associatedPreferencesModel = associatedPreferencesModel;
		this.editSettingActionRenderer.associatedPreferencesModel = associatedPreferencesModel;
	}

	protected createHeader(): void {
		this._register(new SettingsHeaderWidget(this.editor, '')).setMessage(nls.localize('emptyUserSettingsHeader', "Place your settings here to overwrite the Default Settings."));
	}

	public render(): void {
		this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this.associatedPreferencesModel);
		if (this.filterResult) {
			this.filterPreferences(this.filterResult);
		}
	}

	private _updatePreference(key: string, value: any, source: IIndexedSetting): void {
		this._onUpdatePreference.fire({ key, value, source });
		this.updatePreference(key, value, source);
	}

	public updatePreference(key: string, value: any, source: IIndexedSetting): void {
		const overrideIdentifier = source.overrideOf ? overrideIdentifierFromKey(source.overrideOf.key) : null;
		const resource = this.preferencesModel.uri;
		this.configurationService.updateValue(key, value, { overrideIdentifier, resource }, this.preferencesModel.configurationTarget)
			.then(() => this.onSettingUpdated(source));
	}

	private onModelChanged(): void {
		if (!this.editor.getModel()) {
			// model could have been disposed during the delay
			return;
		}
		this.render();
	}

	private onSettingUpdated(setting: ISetting) {
		this.editor.focus();
		setting = this.getSetting(setting);
		if (setting) {
			// TODO:@sandy Selection range should be template range
			this.editor.setSelection(setting.valueRange);
			this.settingHighlighter.highlight(setting, true);
		}
	}

	private getSetting(setting: ISetting): ISetting {
		const { key, overrideOf } = setting;
		if (overrideOf) {
			const setting = this.getSetting(overrideOf);
			for (const override of setting.overrides) {
				if (override.key === key) {
					return override;
				}
			}
			return null;
		}

		return this.preferencesModel.getPreference(key);
	}

	public filterPreferences(filterResult: IFilterResult): void {
		this.filterResult = filterResult;
		this.settingHighlighter.clear(true);
		this.highlightMatchesRenderer.render(filterResult ? filterResult.matches : []);
	}

	public focusPreference(setting: ISetting): void {
		const s = this.getSetting(setting);
		if (s) {
			this.settingHighlighter.highlight(s, true);
			this.editor.setPosition({ lineNumber: s.keyRange.startLineNumber, column: s.keyRange.startColumn });
		} else {
			this.settingHighlighter.clear(true);
		}
	}

	public clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}

	public editPreference(setting: ISetting): boolean {
		const editableSetting = this.getSetting(setting);
		return editableSetting && this.editSettingActionRenderer.activateOnSetting(editableSetting);
	}
}

export class WorkspaceSettingsRenderer extends UserSettingsRenderer implements IPreferencesRenderer<ISetting> {

	private unsupportedSettingsRenderer: UnsupportedSettingsRenderer;
	private workspaceConfigurationRenderer: WorkspaceConfigurationRenderer;

	constructor(editor: ICodeEditor, preferencesModel: SettingsEditorModel,
		@IPreferencesService preferencesService: IPreferencesService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
		this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
		this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
	}

	protected createHeader(): void {
		this._register(new SettingsHeaderWidget(this.editor, '')).setMessage(nls.localize('emptyWorkspaceSettingsHeader', "Place your settings here to overwrite the User Settings."));
	}

	public setAssociatedPreferencesModel(associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		super.setAssociatedPreferencesModel(associatedPreferencesModel);
		this.workspaceConfigurationRenderer.render(this.getAssociatedPreferencesModel());
	}

	public render(): void {
		super.render();
		this.unsupportedSettingsRenderer.render();
		this.workspaceConfigurationRenderer.render(this.getAssociatedPreferencesModel());
	}
}

export class FolderSettingsRenderer extends UserSettingsRenderer implements IPreferencesRenderer<ISetting> {

	private unsupportedSettingsRenderer: UnsupportedSettingsRenderer;

	constructor(editor: ICodeEditor, preferencesModel: SettingsEditorModel,
		@IPreferencesService preferencesService: IPreferencesService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
		this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
	}

	protected createHeader(): void {
		this._register(new SettingsHeaderWidget(this.editor, '')).setMessage(nls.localize('emptyFolderSettingsHeader', "Place your folder settings here to overwrite those from the Workspace Settings."));
	}

	public render(): void {
		super.render();
		this.unsupportedSettingsRenderer.render();
	}
}

export class DefaultSettingsRenderer extends Disposable implements IPreferencesRenderer<ISetting> {

	private _associatedPreferencesModel: IPreferencesEditorModel<ISetting>;
	private settingHighlighter: SettingHighlighter;
	private settingsHeaderRenderer: DefaultSettingsHeaderRenderer;
	private settingsGroupTitleRenderer: SettingsGroupTitleRenderer;
	private filteredMatchesRenderer: FilteredMatchesRenderer;
	private hiddenAreasRenderer: HiddenAreasRenderer;
	private editSettingActionRenderer: EditSettingRenderer;
	private issueWidgetRenderer: IssueWidgetRenderer;
	private feedbackWidgetRenderer: FeedbackWidgetRenderer;
	private bracesHidingRenderer: BracesHidingRenderer;
	private extensionCodelensRenderer: ExtensionCodelensRenderer;
	private filterResult: IFilterResult;

	private readonly _onUpdatePreference: Emitter<{ key: string, value: any, source: IIndexedSetting }> = new Emitter<{ key: string, value: any, source: IIndexedSetting }>();
	public readonly onUpdatePreference: Event<{ key: string, value: any, source: IIndexedSetting }> = this._onUpdatePreference.event;

	private readonly _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private readonly _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: DefaultSettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.settingsHeaderRenderer = this._register(instantiationService.createInstance(DefaultSettingsHeaderRenderer, editor));
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.editSettingActionRenderer = this._register(instantiationService.createInstance(EditSettingRenderer, editor, preferencesModel, this.settingHighlighter));
		this.issueWidgetRenderer = this._register(instantiationService.createInstance(IssueWidgetRenderer, editor));
		this.feedbackWidgetRenderer = this._register(instantiationService.createInstance(FeedbackWidgetRenderer, editor));
		this.bracesHidingRenderer = this._register(instantiationService.createInstance(BracesHidingRenderer, editor, preferencesModel));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, this.bracesHidingRenderer]));
		this.extensionCodelensRenderer = this._register(instantiationService.createInstance(ExtensionCodelensRenderer, editor));

		this._register(this.editSettingActionRenderer.onUpdateSetting(e => this._onUpdatePreference.fire(e)));
		this._register(this.settingsGroupTitleRenderer.onHiddenAreasChanged(() => this.hiddenAreasRenderer.render()));
		this._register(preferencesModel.onDidChangeGroups(() => this.render()));
	}

	public getAssociatedPreferencesModel(): IPreferencesEditorModel<ISetting> {
		return this._associatedPreferencesModel;
	}

	public setAssociatedPreferencesModel(associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		this._associatedPreferencesModel = associatedPreferencesModel;
		this.editSettingActionRenderer.associatedPreferencesModel = associatedPreferencesModel;
	}

	public render() {
		this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
		this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this._associatedPreferencesModel);
		this.issueWidgetRenderer.render(null);
		this.feedbackWidgetRenderer.render(null);
		this.settingHighlighter.clear(true);
		this.bracesHidingRenderer.render(null, this.preferencesModel.settingsGroups);
		this.settingsGroupTitleRenderer.showGroup(0);
		this.hiddenAreasRenderer.render();
	}

	public filterPreferences(filterResult: IFilterResult): void {
		this.filterResult = filterResult;

		if (filterResult) {
			this.filteredMatchesRenderer.render(filterResult, this.preferencesModel.settingsGroups);
			this.settingsGroupTitleRenderer.render(null);
			this.renderIssueWidget(filterResult);
			this.settingsHeaderRenderer.render(filterResult);
			this.settingHighlighter.clear(true);
			this.bracesHidingRenderer.render(filterResult, this.preferencesModel.settingsGroups);
			this.editSettingActionRenderer.render(filterResult.filteredGroups, this._associatedPreferencesModel);
			this.extensionCodelensRenderer.render(filterResult);
		} else {
			this.settingHighlighter.clear(true);
			this.filteredMatchesRenderer.render(null, this.preferencesModel.settingsGroups);
			this.renderIssueWidget(null);
			this.settingsHeaderRenderer.render(null);
			this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
			this.settingsGroupTitleRenderer.showGroup(0);
			this.bracesHidingRenderer.render(null, this.preferencesModel.settingsGroups);
			this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this._associatedPreferencesModel);
			this.extensionCodelensRenderer.render(null);
		}

		this.hiddenAreasRenderer.render();
	}

	private renderIssueWidget(filterResult: IFilterResult): void {
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		if (workbenchSettings.enableNaturalLanguageSearchFeedback) {
			this.issueWidgetRenderer.render(null);
			this.feedbackWidgetRenderer.render(filterResult);
		} else {
			this.feedbackWidgetRenderer.render(null);
			this.issueWidgetRenderer.render(filterResult);
		}
	}

	public focusPreference(s: ISetting): void {
		const setting = this.getSetting(s);
		if (setting) {
			this.settingsGroupTitleRenderer.showSetting(setting);
			this.settingHighlighter.highlight(setting, true);
		} else {
			this.settingHighlighter.clear(true);
		}
	}

	private getSetting(setting: ISetting): ISetting {
		const { key, overrideOf } = setting;
		if (overrideOf) {
			const setting = this.getSetting(overrideOf);
			for (const override of setting.overrides) {
				if (override.key === key) {
					return override;
				}
			}
			return null;
		}
		const settingsGroups = this.filterResult ? this.filterResult.filteredGroups : this.preferencesModel.settingsGroups;
		return this.getPreference(key, settingsGroups);
	}

	private getPreference(key: string, settingsGroups: ISettingsGroup[]): ISetting {
		for (const group of settingsGroups) {
			for (const section of group.sections) {
				for (const setting of section.settings) {
					if (setting.key === key) {
						return setting;
					}
				}
			}
		}
		return null;
	}

	public clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}

	public updatePreference(key: string, value: any, source: ISetting): void {
	}

	public editPreference(setting: ISetting): boolean {
		return this.editSettingActionRenderer.activateOnSetting(setting);
	}
}

export interface HiddenAreasProvider {
	hiddenAreas: IRange[];
}

export class BracesHidingRenderer extends Disposable implements HiddenAreasProvider {
	private _result: IFilterResult;
	private _settingsGroups: ISettingsGroup[];

	constructor(private editor: ICodeEditor) {
		super();
	}

	render(result: IFilterResult, settingsGroups: ISettingsGroup[]): void {
		this._result = result;
		this._settingsGroups = settingsGroups;
	}

	get hiddenAreas(): IRange[] {
		// Opening square brace
		const hiddenAreas = [
			{
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 2,
				endColumn: 1
			}
		];

		const hideBraces = (group: ISettingsGroup, hideExtraLine?: boolean) => {
			// Opening curly brace
			hiddenAreas.push({
				startLineNumber: group.range.startLineNumber - 3,
				startColumn: 1,
				endLineNumber: group.range.startLineNumber - (hideExtraLine ? 1 : 3),
				endColumn: 1
			});

			// Closing curly brace
			hiddenAreas.push({
				startLineNumber: group.range.endLineNumber + 1,
				startColumn: 1,
				endLineNumber: group.range.endLineNumber + 4,
				endColumn: 1
			});
		};

		this._settingsGroups.forEach(g => hideBraces(g));
		if (this._result) {
			this._result.filteredGroups.forEach((g, i) => hideBraces(g, true));
		}

		// Closing square brace
		const lineCount = this.editor.getModel().getLineCount();
		hiddenAreas.push({
			startLineNumber: lineCount,
			startColumn: 1,
			endLineNumber: lineCount,
			endColumn: 1
		});


		return hiddenAreas;
	}

}

class DefaultSettingsHeaderRenderer extends Disposable {

	private settingsHeaderWidget: DefaultSettingsHeaderWidget;
	public readonly onClick: Event<void>;

	constructor(editor: ICodeEditor) {
		super();
		this.settingsHeaderWidget = this._register(new DefaultSettingsHeaderWidget(editor, ''));
		this.onClick = this.settingsHeaderWidget.onClick;
	}

	public render(filterResult: IFilterResult) {
		const hasSettings = !filterResult || filterResult.filteredGroups.length > 0;
		this.settingsHeaderWidget.toggleMessage(hasSettings);
	}
}

export class SettingsGroupTitleRenderer extends Disposable implements HiddenAreasProvider {

	private readonly _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; }

	private settingsGroups: ISettingsGroup[];
	private hiddenGroups: ISettingsGroup[] = [];
	private settingsGroupTitleWidgets: SettingsGroupTitleWidget[];
	private disposables: IDisposable[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public get hiddenAreas(): IRange[] {
		const hiddenAreas: IRange[] = [];
		for (const group of this.hiddenGroups) {
			hiddenAreas.push(group.range);
		}
		return hiddenAreas;
	}

	public render(settingsGroups: ISettingsGroup[]) {
		this.disposeWidgets();
		if (!settingsGroups) {
			return;
		}

		this.settingsGroups = settingsGroups.slice();
		this.settingsGroupTitleWidgets = [];
		for (const group of this.settingsGroups.slice().reverse()) {
			if (group.sections.every(sect => sect.settings.length === 0)) {
				continue;
			}

			const settingsGroupTitleWidget = this.instantiationService.createInstance(SettingsGroupTitleWidget, this.editor, group);
			settingsGroupTitleWidget.render();
			this.settingsGroupTitleWidgets.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget.onToggled(collapsed => this.onToggled(collapsed, settingsGroupTitleWidget.settingsGroup)));
		}
		this.settingsGroupTitleWidgets.reverse();
	}

	public showGroup(groupIdx: number) {
		const shownGroup = this.settingsGroupTitleWidgets[groupIdx].settingsGroup;

		this.hiddenGroups = this.settingsGroups.filter(g => g !== shownGroup);
		for (const groupTitleWidget of this.settingsGroupTitleWidgets.filter(widget => widget.settingsGroup !== shownGroup)) {
			groupTitleWidget.toggleCollapse(true);
		}
		this._onHiddenAreasChanged.fire();
	}

	public showSetting(setting: ISetting): void {
		const settingsGroupTitleWidget = this.settingsGroupTitleWidgets.filter(widget => Range.containsRange(widget.settingsGroup.range, setting.range))[0];
		if (settingsGroupTitleWidget && settingsGroupTitleWidget.isCollapsed()) {
			settingsGroupTitleWidget.toggleCollapse(false);
			this.hiddenGroups.splice(this.hiddenGroups.indexOf(settingsGroupTitleWidget.settingsGroup), 1);
			this._onHiddenAreasChanged.fire();
		}
	}

	private onToggled(collapsed: boolean, group: ISettingsGroup) {
		const index = this.hiddenGroups.indexOf(group);
		if (collapsed) {
			const currentPosition = this.editor.getPosition();
			if (group.range.startLineNumber <= currentPosition.lineNumber && group.range.endLineNumber >= currentPosition.lineNumber) {
				this.editor.setPosition({ lineNumber: group.range.startLineNumber - 1, column: 1 });
			}
			this.hiddenGroups.push(group);
		} else {
			this.hiddenGroups.splice(index, 1);
		}
		this._onHiddenAreasChanged.fire();
	}

	private disposeWidgets() {
		this.hiddenGroups = [];
		this.disposables = dispose(this.disposables);
	}

	public dispose() {
		this.disposeWidgets();
		super.dispose();
	}
}

export class HiddenAreasRenderer extends Disposable {

	constructor(private editor: ICodeEditor, private hiddenAreasProviders: HiddenAreasProvider[]
	) {
		super();
	}

	public render() {
		const ranges: IRange[] = [];
		for (const hiddenAreaProvider of this.hiddenAreasProviders) {
			ranges.push(...hiddenAreaProvider.hiddenAreas);
		}
		this.editor.setHiddenAreas(ranges);
	}

	public dispose() {
		this.editor.setHiddenAreas([]);
		super.dispose();
	}
}

export class FeedbackWidgetRenderer extends Disposable {
	private static readonly DEFAULT_COMMENT_TEXT = 'Replace this comment with any text feedback.';
	private static readonly INSTRUCTION_TEXT = [
		'// Modify the "resultScores" section to contain only your expected results. Assign scores to indicate their relevance.',
		'// Results present in "resultScores" will be automatically "boosted" for this query, if they are not already at the top of the result set.',
		'// Add phrase pairs to the "alts" section to have them considered to be synonyms in queries.'
	].join('\n');

	private _feedbackWidget: FloatingClickWidget;
	private _currentResult: IFilterResult;

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@INotificationService private notificationService: INotificationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		this._currentResult = result;
		if (result && result.metadata) {
			this.showWidget();
		} else if (this._feedbackWidget) {
			this.disposeWidget();
		}
	}

	private showWidget(): void {
		if (!this._feedbackWidget) {
			this._feedbackWidget = this._register(this.instantiationService.createInstance(FloatingClickWidget, this.editor, 'Provide feedback', null));
			this._register(this._feedbackWidget.onClick(() => this.getFeedback()));
			this._feedbackWidget.render();
		}
	}

	private getFeedback(): void {
		if (!this.telemetryService.isOptedIn && this.environmentService.appQuality) {
			this.notificationService.error('Can\'t send feedback, user is opted out of telemetry');
			return;
		}

		const result = this._currentResult;
		const metadata = result.metadata['nlpResult']; // Feedback only on nlpResult set for now
		const actualResults = metadata ? metadata.scoredResults : {};
		const actualResultIds = Object.keys(actualResults);

		const feedbackQuery: any = {};
		feedbackQuery['comment'] = FeedbackWidgetRenderer.DEFAULT_COMMENT_TEXT;
		feedbackQuery['queryString'] = result.query;
		feedbackQuery['duration'] = metadata ? metadata.duration : -1;
		feedbackQuery['resultScores'] = [];
		actualResultIds.forEach(settingId => {
			feedbackQuery['resultScores'].push({
				packageID: actualResults[settingId].packageId,
				key: actualResults[settingId].key,
				score: 10
			});
		});
		feedbackQuery['alts'] = [];

		const groupCountsText = result.filteredGroups
			.map(group => `// ${group.id}: ${group.sections[0].settings.length}`)
			.join('\n');

		const contents = FeedbackWidgetRenderer.INSTRUCTION_TEXT + '\n' +
			JSON.stringify(feedbackQuery, undefined, '    ') + '\n\n' +
			this.getScoreText(actualResults) + '\n\n' +
			groupCountsText + '\n';

		this.editorService.openEditor({ contents, language: 'jsonc' }, /*sideBySide=*/true).then(feedbackEditor => {
			const sendFeedbackWidget = this._register(this.instantiationService.createInstance(FloatingClickWidget, feedbackEditor.getControl(), 'Send feedback', null));
			sendFeedbackWidget.render();

			this._register(sendFeedbackWidget.onClick(() => {
				this.sendFeedback(feedbackEditor.getControl() as ICodeEditor, result, actualResults).then(() => {
					sendFeedbackWidget.dispose();
					this.notificationService.info('Feedback sent successfully');
				}, err => {
					this.notificationService.error('Error sending feedback: ' + err.message);
				});
			}));
		});
	}

	private getScoreText(results?: IScoredResults): string {
		if (!results) {
			return '';
		}

		return Object.keys(results)
			.map(name => {
				return `// ${results[name].key}: ${results[name].score}`;
			}).join('\n');
	}

	private sendFeedback(feedbackEditor: ICodeEditor, result: IFilterResult, scoredResults: IScoredResults): TPromise<void> {
		const model = feedbackEditor.getModel();
		const expectedQueryLines = model.getLinesContent()
			.filter(line => !strings.startsWith(line, '//'));

		let expectedQuery: any;
		try {
			expectedQuery = JSON.parse(expectedQueryLines.join('\n'));
		} catch (e) {
			// invalid JSON
			return TPromise.wrapError(new Error('Invalid JSON: ' + e.message));
		}

		const userComment = expectedQuery.comment === FeedbackWidgetRenderer.DEFAULT_COMMENT_TEXT ? undefined : expectedQuery.comment;

		// validate alts
		if (!this.validateAlts(expectedQuery.alts)) {
			return TPromise.wrapError(new Error('alts must be an array of 2-element string arrays'));
		}

		const altsAdded = expectedQuery.alts && expectedQuery.alts.length;
		const alts = altsAdded ? expectedQuery.alts : undefined;
		const workbenchSettings = this.configurationService.getValue<IWorkbenchSettingsConfiguration>().workbench.settings;
		const autoIngest = workbenchSettings.naturalLanguageSearchAutoIngestFeedback;

		const nlpMetadata = result.metadata && result.metadata['nlpResult'];
		const duration = nlpMetadata && nlpMetadata.duration;
		const requestBody = nlpMetadata && nlpMetadata.requestBody;

		const actualResultScores = {};
		for (let key in scoredResults) {
			actualResultScores[key] = {
				score: scoredResults[key].score
			};
		}

		/* __GDPR__
			"settingsSearchResultFeedback" : {
				"query" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"requestBody" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"userComment" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"actualResults" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"expectedResults" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"duration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"buildNumber" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"alts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"autoIngest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		return this.telemetryService.publicLog('settingsSearchResultFeedback', {
			query: result.query,
			requestBody,
			userComment,
			actualResults: actualResultScores,
			expectedResults: expectedQuery.resultScores,
			duration,
			buildNumber: this.environmentService.settingsSearchBuildId,
			alts,
			autoIngest
		});
	}

	private validateAlts(alts?: string[][]): boolean {
		if (!alts) {
			return true;
		}

		if (!Array.isArray(alts)) {
			return false;
		}

		if (!alts.length) {
			return true;
		}

		if (!alts.every(altPair => Array.isArray(altPair) && altPair.length === 2 && typeof altPair[0] === 'string' && typeof altPair[1] === 'string')) {
			return false;
		}

		return true;
	}

	private disposeWidget(): void {
		if (this._feedbackWidget) {
			this._feedbackWidget.dispose();
			this._feedbackWidget = null;
		}
	}

	public dispose() {
		this.disposeWidget();
		super.dispose();
	}
}

export class IssueWidgetRenderer extends Disposable {
	private _issueWidget: FloatingClickWidget;
	private _currentResult: IFilterResult;

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchIssueService private issueService: IWorkbenchIssueService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		this._currentResult = result;
		if (result && result.metadata && this.environmentService.appQuality !== 'stable') {
			this.showWidget();
		} else if (this._issueWidget) {
			this.disposeWidget();
		}
	}

	private showWidget(): void {
		if (!this._issueWidget) {
			this._issueWidget = this._register(this.instantiationService.createInstance(FloatingClickWidget, this.editor, nls.localize('reportSettingsSearchIssue', "Report Issue"), null));
			this._register(this._issueWidget.onClick(() => this.showIssueReporter()));
			this._issueWidget.render();
		}
	}

	private showIssueReporter(): TPromise<void> {
		const nlpMetadata = this._currentResult.metadata['nlpResult'];
		const results = nlpMetadata.scoredResults;

		const enabledExtensions = nlpMetadata.extensions;
		const issueResults = Object.keys(results)
			.map(key => (<ISettingSearchResult>{
				key: key.split('##')[1],
				extensionId: results[key].packageId === 'core' ?
					'core' :
					this.getExtensionIdByGuid(enabledExtensions, results[key].packageId),
				score: results[key].score
			}))
			.slice(0, 20);

		const issueReporterData: Partial<ISettingsSearchIssueReporterData> = {
			enabledExtensions,
			issueType: IssueType.SettingsSearchIssue,
			actualSearchResults: issueResults,
			filterResultCount: this.getFilterResultCount(),
			query: this._currentResult.query
		};

		return this.issueService.openReporter(issueReporterData);
	}

	private getFilterResultCount(): number {
		const filterResultGroup = arrays.first(this._currentResult.filteredGroups, group => group.id === 'filterResult');
		return filterResultGroup ?
			filterResultGroup.sections[0].settings.length :
			0;
	}

	private getExtensionIdByGuid(extensions: ILocalExtension[], guid: string): string {
		const match = arrays.first(extensions, ext => ext.identifier.uuid === guid);

		// identifier.id includes the version, not needed here
		return match && `${match.manifest.publisher}.${match.manifest.name}`;
	}

	private disposeWidget(): void {
		if (this._issueWidget) {
			this._issueWidget.dispose();
			this._issueWidget = null;
		}
	}

	public dispose() {
		this.disposeWidget();
		super.dispose();
	}
}

export class FilteredMatchesRenderer extends Disposable implements HiddenAreasProvider {

	private decorationIds: string[] = [];
	public hiddenAreas: IRange[] = [];

	constructor(private editor: ICodeEditor
	) {
		super();
	}

	public render(result: IFilterResult, allSettingsGroups: ISettingsGroup[]): void {
		const model = this.editor.getModel();
		this.hiddenAreas = [];
		if (result) {
			this.hiddenAreas = this.computeHiddenRanges(result.filteredGroups, result.allGroups, model);
			this.decorationIds = this.editor.deltaDecorations(this.decorationIds, result.matches.map(match => this.createDecoration(match, model)));
		} else {
			this.hiddenAreas = this.computeHiddenRanges(null, allSettingsGroups, model);
			this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
		}
	}

	private createDecoration(range: IRange, model: ITextModel): IModelDeltaDecoration {
		return {
			range,
			options: FilteredMatchesRenderer._FIND_MATCH
		};
	}

	private static readonly _FIND_MATCH = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch'
	});

	private computeHiddenRanges(filteredGroups: ISettingsGroup[], allSettingsGroups: ISettingsGroup[], model: ITextModel): IRange[] {
		// Hide the contents of hidden groups
		const notMatchesRanges: IRange[] = [];
		if (filteredGroups) {
			allSettingsGroups.forEach((group, i) => {
				notMatchesRanges.push({
					startLineNumber: group.range.startLineNumber - 1,
					startColumn: group.range.startColumn,
					endLineNumber: group.range.endLineNumber,
					endColumn: group.range.endColumn
				});
			});
		}

		return notMatchesRanges;
	}

	public dispose() {
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
		super.dispose();
	}
}

export class HighlightMatchesRenderer extends Disposable {

	private decorationIds: string[] = [];

	constructor(private editor: ICodeEditor
	) {
		super();
	}

	public render(matches: IRange[]): void {
		const model = this.editor.getModel();
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, matches.map(match => this.createDecoration(match, model)));
	}

	private static readonly _FIND_MATCH = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch'
	});

	private createDecoration(range: IRange, model: ITextModel): IModelDeltaDecoration {
		return {
			range,
			options: HighlightMatchesRenderer._FIND_MATCH
		};
	}

	public dispose() {
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
		super.dispose();
	}
}

export class ExtensionCodelensRenderer extends Disposable implements CodeLensProvider {
	private filterResult: IFilterResult;

	constructor() {
		super();
		this._register(CodeLensProviderRegistry.register({ pattern: '**/settings.json' }, this));
	}

	public render(filterResult: IFilterResult): void {
		this.filterResult = filterResult;
	}

	public provideCodeLenses(model: ITextModel, token: CancellationToken): ICodeLensSymbol[] {
		if (!this.filterResult || !this.filterResult.filteredGroups) {
			return [];
		}

		const newExtensionGroup = arrays.first(this.filterResult.filteredGroups, g => g.id === 'newExtensionsResult');
		if (!newExtensionGroup) {
			return [];
		}

		return newExtensionGroup.sections[0].settings
			.filter((s: IExtensionSetting) => {
				// Skip any non IExtensionSettings that somehow got in here
				return s.extensionName && s.extensionPublisher;
			})
			.map((s: IExtensionSetting) => {
				const extId = s.extensionPublisher + '.' + s.extensionName;
				return <ICodeLensSymbol>{
					command: {
						title: nls.localize('newExtensionLabel', "Show Extension \"{0}\"", extId),
						id: 'workbench.extensions.action.showExtensionsWithId',
						arguments: [extId.toLowerCase()]
					},
					range: new Range(s.keyRange.startLineNumber, 1, s.keyRange.startLineNumber, 1)
				};
			});
	}

	public resolveCodeLens(model: ITextModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol {
		return codeLens;
	}
}

export interface IIndexedSetting extends ISetting {
	index: number;
	groupId: string;
}

class EditSettingRenderer extends Disposable {

	private editPreferenceWidgetForCursorPosition: EditPreferenceWidget<IIndexedSetting>;
	private editPreferenceWidgetForMouseMove: EditPreferenceWidget<IIndexedSetting>;

	private settingsGroups: ISettingsGroup[];
	public associatedPreferencesModel: IPreferencesEditorModel<ISetting>;
	private toggleEditPreferencesForMouseMoveDelayer: Delayer<void>;

	private readonly _onUpdateSetting: Emitter<{ key: string, value: any, source: IIndexedSetting }> = new Emitter<{ key: string, value: any, source: IIndexedSetting }>();
	public readonly onUpdateSetting: Event<{ key: string, value: any, source: IIndexedSetting }> = this._onUpdateSetting.event;

	constructor(private editor: ICodeEditor, private masterSettingsModel: ISettingsEditorModel,
		private settingHighlighter: SettingHighlighter,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();

		this.editPreferenceWidgetForCursorPosition = <EditPreferenceWidget<IIndexedSetting>>this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.editPreferenceWidgetForMouseMove = <EditPreferenceWidget<IIndexedSetting>>this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.toggleEditPreferencesForMouseMoveDelayer = new Delayer<void>(75);

		this._register(this.editPreferenceWidgetForCursorPosition.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForCursorPosition, e)));
		this._register(this.editPreferenceWidgetForMouseMove.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));

		this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
		this._register(this.editor.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
		this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
	}

	public render(settingsGroups: ISettingsGroup[], associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		this.editPreferenceWidgetForCursorPosition.hide();
		this.editPreferenceWidgetForMouseMove.hide();
		this.settingsGroups = settingsGroups;
		this.associatedPreferencesModel = associatedPreferencesModel;

		const settings = this.getSettings(this.editor.getPosition().lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
		}
	}

	private isDefaultSettings(): boolean {
		return this.masterSettingsModel instanceof DefaultSettingsEditorModel;
	}

	private onConfigurationChanged(): void {
		if (!this.editor.getConfiguration().viewInfo.glyphMargin) {
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

	private getEditPreferenceWidgetUnderMouse(mouseMoveEvent: IEditorMouseEvent): EditPreferenceWidget<ISetting> {
		if (mouseMoveEvent.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			const line = mouseMoveEvent.target.position.lineNumber;
			if (this.editPreferenceWidgetForMouseMove.getLine() === line && this.editPreferenceWidgetForMouseMove.isVisible()) {
				return this.editPreferenceWidgetForMouseMove;
			}
			if (this.editPreferenceWidgetForCursorPosition.getLine() === line && this.editPreferenceWidgetForCursorPosition.isVisible()) {
				return this.editPreferenceWidgetForCursorPosition;
			}
		}
		return null;
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
		if (this.editor.getConfiguration().viewInfo.glyphMargin && this.marginFreeFromOtherDecorations(line)) {
			editPreferencesWidget.show(line, nls.localize('editTtile', "Edit"), settings);
			const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCursorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCursorPosition;
			editPreferenceWidgetToHide.hide();
		}
	}

	private marginFreeFromOtherDecorations(line: number): boolean {
		const decorations = this.editor.getLineDecorations(line);
		if (decorations) {
			for (const { options } of decorations) {
				if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf(EditPreferenceWidget.GLYPH_MARGIN_CLASS_NAME) === -1) {
					return false;
				}
			}
		}
		return true;
	}

	private getSettings(lineNumber: number): IIndexedSetting[] {
		const configurationMap = this.getConfigurationsMap();
		return this.getSettingsAtLineNumber(lineNumber).filter(setting => {
			let configurationNode = configurationMap[setting.key];
			if (configurationNode) {
				if (this.isDefaultSettings()) {
					if (setting.key === 'launch') {
						// Do not show because of https://github.com/Microsoft/vscode/issues/32593
						return false;
					}
					return true;
				}
				if (configurationNode.type === 'boolean' || configurationNode.enum) {
					if ((<SettingsEditorModel>this.masterSettingsModel).configurationTarget !== ConfigurationTarget.WORKSPACE_FOLDER) {
						return true;
					}
					if (configurationNode.scope === ConfigurationScope.RESOURCE) {
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
							if (!this.isDefaultSettings() && setting.overrides.length) {
								// Only one level because override settings cannot have override settings
								for (const overrideSetting of setting.overrides) {
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
		const anchor = { x: e.event.posx, y: e.event.posy + 10 };
		const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key])
			: editPreferenceWidget.preferences.map(setting => new ContextSubMenu(setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions)
		});
	}

	public activateOnSetting(setting: ISetting): boolean {
		const startLine = setting.keyRange.startLineNumber;
		const settings = this.getSettings(startLine);
		if (!settings.length) {
			return false;
		}

		this.editPreferenceWidgetForMouseMove.show(startLine, '', settings);
		const actions = this.getActions(this.editPreferenceWidgetForMouseMove.preferences[0], this.getConfigurationsMap()[this.editPreferenceWidgetForMouseMove.preferences[0].key]);
		this.contextMenuService.showContextMenu({
			getAnchor: () => this.toAbsoluteCoords(new Position(startLine, 1)),
			getActions: () => TPromise.wrap(actions)
		});

		return true;
	}

	private toAbsoluteCoords(position: Position): { x: number, y: number } {
		const positionCoords = this.editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
		const x = editorCoords.left + positionCoords.left;
		const y = editorCoords.top + positionCoords.top + positionCoords.height;

		return { x, y: y + 10 };
	}

	private getConfigurationsMap(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	}

	private getActions(setting: IIndexedSetting, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boolean') {
			return [<IAction>{
				id: 'truthyValue',
				label: 'true',
				enabled: true,
				run: () => this.updateSetting(setting.key, true, setting)
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => this.updateSetting(setting.key, false, setting)
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: JSON.stringify(value),
					enabled: true,
					run: () => this.updateSetting(setting.key, value, setting)
				};
			});
		}
		return this.getDefaultActions(setting);
	}

	private getDefaultActions(setting: IIndexedSetting): IAction[] {
		if (this.isDefaultSettings()) {
			const settingInOtherModel = this.associatedPreferencesModel.getPreference(setting.key);
			return [<IAction>{
				id: 'setDefaultValue',
				label: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
				enabled: true,
				run: () => this.updateSetting(setting.key, setting.value, setting)
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
	private highlightedSetting: ISetting;

	constructor(private editor: ICodeEditor, private readonly focusEventEmitter: Emitter<ISetting>, private readonly clearFocusEventEmitter: Emitter<ISetting>,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
		this.fixedHighlighter.onHighlghtRemoved(() => this.clearFocusEventEmitter.fire(this.highlightedSetting));
		this.volatileHighlighter.onHighlghtRemoved(() => this.clearFocusEventEmitter.fire(this.highlightedSetting));
	}

	highlight(setting: ISetting, fix: boolean = false) {
		this.highlightedSetting = setting;
		this.volatileHighlighter.removeHighlightRange();
		this.fixedHighlighter.removeHighlightRange();

		const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
		highlighter.highlightRange({
			range: setting.valueRange,
			resource: this.editor.getModel().uri
		}, this.editor);

		this.editor.revealLineInCenterIfOutsideViewport(setting.valueRange.startLineNumber, editorCommon.ScrollType.Smooth);
		this.focusEventEmitter.fire(setting);
	}

	clear(fix: boolean = false): void {
		this.volatileHighlighter.removeHighlightRange();
		if (fix) {
			this.fixedHighlighter.removeHighlightRange();
		}
		this.clearFocusEventEmitter.fire(this.highlightedSetting);
	}
}

class UnsupportedSettingsRenderer extends Disposable {

	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(
		private editor: ICodeEditor,
		private settingsEditorModel: SettingsEditorModel,
		@IMarkerService private markerService: IMarkerService
	) {
		super();
		this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
	}

	public render(): void {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const markerData: IMarkerData[] = [];
		for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
			for (const section of settingsGroup.sections) {
				for (const setting of section.settings) {
					if (this.settingsEditorModel.configurationTarget === ConfigurationTarget.WORKSPACE || this.settingsEditorModel.configurationTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
						// Show warnings for executable settings
						if (configurationRegistry[setting.key] && configurationRegistry[setting.key].isExecutable) {
							markerData.push({
								severity: MarkerSeverity.Warning,
								startLineNumber: setting.keyRange.startLineNumber,
								startColumn: setting.keyRange.startColumn,
								endLineNumber: setting.keyRange.endLineNumber,
								endColumn: setting.keyRange.endColumn,
								message: this.getMarkerMessage(setting.key)
							});
						}
					}
				}
			}
		}
		if (markerData.length) {
			this.markerService.changeOne('preferencesEditor', this.settingsEditorModel.uri, markerData);
		} else {
			this.markerService.remove('preferencesEditor', [this.settingsEditorModel.uri]);
		}
	}

	private getMarkerMessage(settingKey: string): string {
		switch (settingKey) {
			case 'php.validate.executablePath':
				return nls.localize('unsupportedPHPExecutablePathSetting', "This setting must be a User Setting. To configure PHP for the workspace, open a PHP file and click on 'PHP Path' in the status bar.");
			default:
				return nls.localize('unsupportedWorkspaceSetting', "This setting must be a User Setting.");
		}
	}

	public dispose(): void {
		this.markerService.remove('preferencesEditor', [this.settingsEditorModel.uri]);
		super.dispose();
	}
}

class WorkspaceConfigurationRenderer extends Disposable {

	private decorationIds: string[] = [];
	private associatedSettingsEditorModel: IPreferencesEditorModel<ISetting>;
	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(private editor: ICodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService
	) {
		super();
		this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render(this.associatedSettingsEditorModel))));
	}

	public render(associatedSettingsEditorModel: IPreferencesEditorModel<ISetting>): void {
		this.associatedSettingsEditorModel = associatedSettingsEditorModel;
		// Dim other configurations in workspace configuration file only in the context of Settings Editor
		if (this.associatedSettingsEditorModel && this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceSettingsEditorModel instanceof WorkspaceConfigurationEditorModel) {
			const ranges: IRange[] = [];
			for (const settingsGroup of this.workspaceSettingsEditorModel.configurationGroups) {
				for (const section of settingsGroup.sections) {
					for (const setting of section.settings) {
						if (setting.key !== 'settings') {
							ranges.push({
								startLineNumber: setting.keyRange.startLineNumber,
								startColumn: setting.keyRange.startColumn - 1,
								endLineNumber: setting.valueRange.endLineNumber,
								endColumn: setting.valueRange.endColumn
							});
						}
					}
				}
			}
			this.decorationIds = this.editor.deltaDecorations(this.decorationIds, ranges.map(range => this.createDecoration(range, this.editor.getModel())));
		}
	}

	private static readonly _DIM_CONFIGURATION_ = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'dim-configuration'
	});

	private createDecoration(range: IRange, model: ITextModel): IModelDeltaDecoration {
		return {
			range,
			options: WorkspaceConfigurationRenderer._DIM_CONFIGURATION_
		};
	}

	public dispose(): void {
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
		super.dispose();
	}
}
