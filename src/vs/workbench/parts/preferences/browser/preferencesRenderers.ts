/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPreferencesService, ISettingsGroup, ISetting, IPreferencesEditorModel, IFilterResult, ISettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService, ContextSubMenu } from 'vs/platform/contextview/browser/contextView';
import { SettingsGroupTitleWidget, EditPreferenceWidget, SettingsHeaderWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IConfigurationEditingService, ConfigurationEditingError, ConfigurationEditingErrorCode, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { overrideIdentifierFromKey } from 'vs/platform/configuration/common/model';
import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { IWorkspaceContextService } from "vs/platform/workspace/common/workspace";

export interface IPreferencesRenderer<T> extends IDisposable {
	preferencesModel: IPreferencesEditorModel<T>;
	associatedPreferencesModel: IPreferencesEditorModel<T>;

	onFocusPreference: Event<T>;
	onClearFocusPreference: Event<T>;
	onUpdatePreference: Event<{ key: string, value: any, source: T }>;

	render(): void;
	updatePreference(key: string, value: any, source: T): void;
	filterPreferences(filterResult: IFilterResult): void;
	focusPreference(setting: T): void;
	clearFocus(setting: T): void;
}


export class UserSettingsRenderer extends Disposable implements IPreferencesRenderer<ISetting> {

	private settingHighlighter: SettingHighlighter;
	private editSettingActionRenderer: EditSettingRenderer;
	private highlightMatchesRenderer: HighlightMatchesRenderer;
	private modelChangeDelayer: Delayer<void> = new Delayer<void>(200);

	private _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private _onUpdatePreference: Emitter<{ key: string, value: any, source: ISetting }> = new Emitter<{ key: string, value: any, source: ISetting }>();
	public readonly onUpdatePreference: Event<{ key: string, value: any, source: ISetting }> = this._onUpdatePreference.event;

	private _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	private filterResult: IFilterResult;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: SettingsEditorModel, public readonly associatedPreferencesModel: IPreferencesEditorModel<ISetting>,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ITextFileService private textFileService: ITextFileService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this._register(preferencesModel);
		this._register(associatedPreferencesModel);
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.highlightMatchesRenderer = this._register(instantiationService.createInstance(HighlightMatchesRenderer, editor));
		this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this.updatePreference(key, value, source)));
		this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));

		this.createHeader();
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

	public updatePreference(key: string, value: any, source: ISetting): void {
		this.telemetryService.publicLog('defaultSettingsActions.copySetting', { userConfigurationKeys: [key] });
		const overrideIdentifier = source.overrideOf ? overrideIdentifierFromKey(source.overrideOf.key) : null;
		const resource = this.preferencesModel.uri;
		this.configurationEditingService.writeConfiguration(this.preferencesModel.configurationTarget, { key, value }, { donotSave: this.textFileService.isDirty(resource), donotNotifyError: true, scopes: { overrideIdentifier, resource } })
			.then(() => this.onSettingUpdated(source), error => {
				this.messageService.show(Severity.Error, this.toErrorMessage(error, this.preferencesModel.configurationTarget));
			});
	}

	private toErrorMessage(error: ConfigurationEditingError, target: ConfigurationTarget): string {
		switch (error.code) {
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
				return nls.localize('errorInvalidConfiguration', "Unable to write into settings. Correct errors/warnings in the file and try again.");
			};
		}
		return error.message;
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
		} else {
			this.settingHighlighter.clear(true);
		}
	}

	public clearFocus(setting: ISetting): void {
		this.settingHighlighter.clear(true);
	}
}

export class WorkspaceSettingsRenderer extends UserSettingsRenderer implements IPreferencesRenderer<ISetting> {

	private untrustedSettingRenderer: UnsupportedWorkspaceSettingsRenderer;
	private workspaceConfigurationRenderer: WorkspaceConfigurationRenderer;

	constructor(editor: ICodeEditor, preferencesModel: SettingsEditorModel, associatedPreferencesModel: IPreferencesEditorModel<ISetting>,
		@IPreferencesService preferencesService: IPreferencesService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextFileService textFileService: ITextFileService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService,
		@IMessageService messageService: IMessageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editor, preferencesModel, associatedPreferencesModel, preferencesService, telemetryService, textFileService, configurationEditingService, messageService, instantiationService);
		this.untrustedSettingRenderer = this._register(instantiationService.createInstance(UnsupportedWorkspaceSettingsRenderer, editor, preferencesModel));
		this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
	}

	protected createHeader(): void {
		this._register(new SettingsHeaderWidget(this.editor, '')).setMessage(nls.localize('emptyWorkspaceSettingsHeader', "Place your settings here to overwrite the User Settings."));
	}

	public render(): void {
		super.render();
		this.untrustedSettingRenderer.render();
		this.workspaceConfigurationRenderer.render();
	}
}

export class FolderSettingsRenderer extends UserSettingsRenderer implements IPreferencesRenderer<ISetting> {

	private unsupportedWorkbenchSettingsRenderer: UnsupportedWorkbenchSettingsRenderer;

	constructor(editor: ICodeEditor, preferencesModel: SettingsEditorModel, associatedPreferencesModel: IPreferencesEditorModel<ISetting>,
		@IPreferencesService preferencesService: IPreferencesService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextFileService textFileService: ITextFileService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService,
		@IMessageService messageService: IMessageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editor, preferencesModel, associatedPreferencesModel, preferencesService, telemetryService, textFileService, configurationEditingService, messageService, instantiationService);
		this.unsupportedWorkbenchSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedWorkbenchSettingsRenderer, editor, preferencesModel));
	}

	protected createHeader(): void {
		this._register(new SettingsHeaderWidget(this.editor, '')).setMessage(nls.localize('emptyFolderSettingsHeader', "Place your folder settings here to overwrite those from the Workspace Settings."));
	}

	public render(): void {
		super.render();
		this.unsupportedWorkbenchSettingsRenderer.render();
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

	private _onUpdatePreference: Emitter<{ key: string, value: any, source: ISetting }> = new Emitter<{ key: string, value: any, source: ISetting }>();
	public readonly onUpdatePreference: Event<{ key: string, value: any, source: ISetting }> = this._onUpdatePreference.event;

	private _onFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onFocusPreference: Event<ISetting> = this._onFocusPreference.event;

	private _onClearFocusPreference: Emitter<ISetting> = new Emitter<ISetting>();
	public readonly onClearFocusPreference: Event<ISetting> = this._onClearFocusPreference.event;

	private filterResult: IFilterResult;

	constructor(protected editor: ICodeEditor, public readonly preferencesModel: DefaultSettingsEditorModel,
		@IPreferencesService protected preferencesService: IPreferencesService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();
		this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor, this._onFocusPreference, this._onClearFocusPreference));
		this.settingsHeaderRenderer = this._register(instantiationService.createInstance(DefaultSettingsHeaderRenderer, editor, preferencesModel.configurationScope));
		this.settingsGroupTitleRenderer = this._register(instantiationService.createInstance(SettingsGroupTitleRenderer, editor));
		this.filteredMatchesRenderer = this._register(instantiationService.createInstance(FilteredMatchesRenderer, editor));
		this.editSettingActionRenderer = this._register(instantiationService.createInstance(EditSettingRenderer, editor, preferencesModel, this.settingHighlighter));
		this._register(this.editSettingActionRenderer.onUpdateSetting(e => this._onUpdatePreference.fire(e)));
		const paranthesisHidingRenderer = this._register(instantiationService.createInstance(StaticContentHidingRenderer, editor, preferencesModel.settingsGroups));
		this.hiddenAreasRenderer = this._register(instantiationService.createInstance(HiddenAreasRenderer, editor, [this.settingsGroupTitleRenderer, this.filteredMatchesRenderer, paranthesisHidingRenderer]));

		this._register(this.settingsGroupTitleRenderer.onHiddenAreasChanged(() => this.hiddenAreasRenderer.render()));
	}

	public get associatedPreferencesModel(): IPreferencesEditorModel<ISetting> {
		return this._associatedPreferencesModel;
	}

	public set associatedPreferencesModel(associatedPreferencesModel: IPreferencesEditorModel<ISetting>) {
		this._associatedPreferencesModel = associatedPreferencesModel;
		this.editSettingActionRenderer.associatedPreferencesModel = associatedPreferencesModel;
	}

	public render() {
		this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
		this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this._associatedPreferencesModel);
		this.hiddenAreasRenderer.render();
		this.settingHighlighter.clear(true);
		this.settingsGroupTitleRenderer.showGroup(1);
		this.hiddenAreasRenderer.render();
	}

	public filterPreferences(filterResult: IFilterResult): void {
		this.filterResult = filterResult;
		if (!filterResult) {
			this.settingHighlighter.clear(true);
			this.filteredMatchesRenderer.render(null);
			this.settingsHeaderRenderer.render(this.preferencesModel.settingsGroups);
			this.settingsGroupTitleRenderer.render(this.preferencesModel.settingsGroups);
			this.settingsGroupTitleRenderer.showGroup(1);
			this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this._associatedPreferencesModel);
		} else {
			this.filteredMatchesRenderer.render(filterResult);
			this.settingsHeaderRenderer.render(filterResult.filteredGroups);
			this.settingsGroupTitleRenderer.render(filterResult.filteredGroups);
			this.settingHighlighter.clear(true);
			this.editSettingActionRenderer.render(filterResult.filteredGroups, this._associatedPreferencesModel);
		}
		this.hiddenAreasRenderer.render();
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

	public collapseAll() {
		this.settingsGroupTitleRenderer.collapseAll();
	}

	public updatePreference(key: string, value: any, source: ISetting): void {
	}
}

export interface HiddenAreasProvider {
	hiddenAreas: IRange[];
}

export class StaticContentHidingRenderer extends Disposable implements HiddenAreasProvider {

	constructor(private editor: ICodeEditor, private settingsGroups: ISettingsGroup[]
	) {
		super();
	}

	get hiddenAreas(): IRange[] {
		const model = this.editor.getModel();
		return [
			{
				startLineNumber: 1,
				startColumn: model.getLineMinColumn(1),
				endLineNumber: 2,
				endColumn: model.getLineMaxColumn(2)
			},
			{
				startLineNumber: this.settingsGroups[0].range.endLineNumber + 1,
				startColumn: model.getLineMinColumn(this.settingsGroups[0].range.endLineNumber + 1),
				endLineNumber: this.settingsGroups[0].range.endLineNumber + 4,
				endColumn: model.getLineMaxColumn(this.settingsGroups[0].range.endLineNumber + 4)
			},
			{
				startLineNumber: model.getLineCount() - 1,
				startColumn: model.getLineMinColumn(model.getLineCount() - 1),
				endLineNumber: model.getLineCount(),
				endColumn: model.getLineMaxColumn(model.getLineCount())
			}
		];
	}

}

class DefaultSettingsHeaderRenderer extends Disposable {

	private settingsHeaderWidget: SettingsHeaderWidget;

	constructor(private editor: ICodeEditor, scope: ConfigurationScope) {
		super();
		const title = scope === ConfigurationScope.RESOURCE ? nls.localize('defaultFolderSettingsTitle', "Default Folder Settings") : nls.localize('defaultSettingsTitle', "Default Settings");
		this.settingsHeaderWidget = this._register(new SettingsHeaderWidget(editor, title));
	}

	public render(settingsGroups: ISettingsGroup[]) {
		if (settingsGroups.length) {
			this.settingsHeaderWidget.setMessage('');
		} else {
			this.settingsHeaderWidget.setMessage(nls.localize('noSettingsFound', "No Settings Found."));
		}
	}
}

export class SettingsGroupTitleRenderer extends Disposable implements HiddenAreasProvider {

	private _onHiddenAreasChanged: Emitter<void> = new Emitter<void>();
	get onHiddenAreasChanged(): Event<void> { return this._onHiddenAreasChanged.event; };

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
		this.settingsGroups = settingsGroups.slice();
		this.settingsGroupTitleWidgets = [];
		for (const group of this.settingsGroups.slice().reverse()) {
			const settingsGroupTitleWidget = this.instantiationService.createInstance(SettingsGroupTitleWidget, this.editor, group);
			settingsGroupTitleWidget.render();
			this.settingsGroupTitleWidgets.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget);
			this.disposables.push(settingsGroupTitleWidget.onToggled(collapsed => this.onToggled(collapsed, settingsGroupTitleWidget.settingsGroup)));
		}
		this.settingsGroupTitleWidgets.reverse();
	}

	public showGroup(group: number) {
		this.hiddenGroups = this.settingsGroups.filter((g, i) => i !== group - 1);
		for (const groupTitleWidget of this.settingsGroupTitleWidgets.filter((g, i) => i !== group - 1)) {
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

	public collapseAll() {
		this.editor.setPosition({ lineNumber: 1, column: 1 });
		this.hiddenGroups = this.settingsGroups.slice();
		for (const groupTitleWidget of this.settingsGroupTitleWidgets) {
			groupTitleWidget.toggleCollapse(true);
		}
		this._onHiddenAreasChanged.fire();
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

	constructor(private editor: ICodeEditor, private hiddenAreasProviders: HiddenAreasProvider[],
		@IInstantiationService private instantiationService: IInstantiationService
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

export class FilteredMatchesRenderer extends Disposable implements HiddenAreasProvider {

	private decorationIds: string[] = [];
	public hiddenAreas: IRange[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(result: IFilterResult): void {
		const model = this.editor.getModel();
		this.hiddenAreas = [];
		this.editor.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (result) {
			this.hiddenAreas = this.computeHiddenRanges(result.filteredGroups, result.allGroups, model);
			this.editor.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, result.matches.map(match => this.createDecoration(match, model)));
			});
		}
	}

	private createDecoration(range: IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: 'findMatch'
			}
		};
	}

	private computeHiddenRanges(filteredGroups: ISettingsGroup[], allSettingsGroups: ISettingsGroup[], model: editorCommon.IModel): IRange[] {
		const notMatchesRanges: IRange[] = [];
		for (const group of allSettingsGroups) {
			const filteredGroup = filteredGroups.filter(g => g.title === group.title)[0];
			if (!filteredGroup) {
				notMatchesRanges.push({
					startLineNumber: group.range.startLineNumber - 1,
					startColumn: model.getLineMinColumn(group.range.startLineNumber - 1),
					endLineNumber: group.range.endLineNumber,
					endColumn: model.getLineMaxColumn(group.range.endLineNumber),
				});
			} else {
				for (const section of group.sections) {
					if (section.titleRange) {
						if (!this.containsLine(section.titleRange.startLineNumber, filteredGroup)) {
							notMatchesRanges.push(this.createCompleteRange(section.titleRange, model));
						}
					}
					for (const setting of section.settings) {
						if (!this.containsLine(setting.range.startLineNumber, filteredGroup)) {
							notMatchesRanges.push(this.createCompleteRange(setting.range, model));
						}
					}
				}
			}
		}
		return notMatchesRanges;
	}

	private containsLine(lineNumber: number, settingsGroup: ISettingsGroup): boolean {
		if (settingsGroup.titleRange && lineNumber >= settingsGroup.titleRange.startLineNumber && lineNumber <= settingsGroup.titleRange.endLineNumber) {
			return true;
		}

		for (const section of settingsGroup.sections) {
			if (section.titleRange && lineNumber >= section.titleRange.startLineNumber && lineNumber <= section.titleRange.endLineNumber) {
				return true;
			}

			for (const setting of section.settings) {
				if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private createCompleteRange(range: IRange, model: editorCommon.IModel): IRange {
		return {
			startLineNumber: range.startLineNumber,
			startColumn: model.getLineMinColumn(range.startLineNumber),
			endLineNumber: range.endLineNumber,
			endColumn: model.getLineMaxColumn(range.endLineNumber)
		};
	}

	public dispose() {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

export class HighlightMatchesRenderer extends Disposable {

	private decorationIds: string[] = [];

	constructor(private editor: ICodeEditor,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public render(matches: IRange[]): void {
		const model = this.editor.getModel();
		this.editor.changeDecorations(changeAccessor => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
		});
		if (matches.length) {
			this.editor.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, matches.map(match => this.createDecoration(match, model)));
			});
		}
	}

	private static _FIND_MATCH = ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch'
	});

	private createDecoration(range: IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: HighlightMatchesRenderer._FIND_MATCH
		};
	}

	public dispose() {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

class EditSettingRenderer extends Disposable {

	private editPreferenceWidgetForCusorPosition: EditPreferenceWidget<ISetting>;
	private editPreferenceWidgetForMouseMove: EditPreferenceWidget<ISetting>;

	private settingsGroups: ISettingsGroup[];
	public associatedPreferencesModel: IPreferencesEditorModel<ISetting>;
	private toggleEditPreferencesForMouseMoveDelayer: Delayer<void>;

	private _onUpdateSetting: Emitter<{ key: string, value: any, source: ISetting }> = new Emitter<{ key: string, value: any, source: ISetting }>();
	public readonly onUpdateSetting: Event<{ key: string, value: any, source: ISetting }> = this._onUpdateSetting.event;

	constructor(private editor: ICodeEditor, private masterSettingsModel: ISettingsEditorModel,
		private settingHighlighter: SettingHighlighter,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();

		this.editPreferenceWidgetForCusorPosition = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
		this.toggleEditPreferencesForMouseMoveDelayer = new Delayer<void>(75);

		this._register(this.editPreferenceWidgetForCusorPosition.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForCusorPosition, e)));
		this._register(this.editPreferenceWidgetForMouseMove.onClick(e => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));

		this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
		this._register(this.editor.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
		this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
	}

	public render(settingsGroups: ISettingsGroup[], associatedPreferencesModel: IPreferencesEditorModel<ISetting>): void {
		this.editPreferenceWidgetForCusorPosition.hide();
		this.editPreferenceWidgetForMouseMove.hide();
		this.settingsGroups = settingsGroups;
		this.associatedPreferencesModel = associatedPreferencesModel;

		const settings = this.getSettings(this.editor.getPosition().lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCusorPosition, settings);
		}
	}

	private isDefaultSettings(): boolean {
		return this.masterSettingsModel instanceof DefaultSettingsEditorModel;
	}

	private onConfigurationChanged(): void {
		if (!this.editor.getConfiguration().viewInfo.glyphMargin) {
			this.editPreferenceWidgetForCusorPosition.hide();
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private onPositionChanged(positionChangeEvent: ICursorPositionChangedEvent) {
		this.editPreferenceWidgetForMouseMove.hide();
		const settings = this.getSettings(positionChangeEvent.position.lineNumber);
		if (settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForCusorPosition, settings);
		} else {
			this.editPreferenceWidgetForCusorPosition.hide();
		}
	}

	private onMouseMoved(mouseMoveEvent: IEditorMouseEvent): void {
		const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
		if (editPreferenceWidget) {
			this.onMouseOver(editPreferenceWidget);
			return;
		}
		this.settingHighlighter.clear();
		this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEidtPreferenceWidgetForMouseMove(mouseMoveEvent));
	}

	private getEditPreferenceWidgetUnderMouse(mouseMoveEvent: IEditorMouseEvent): EditPreferenceWidget<ISetting> {
		if (mouseMoveEvent.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			const line = mouseMoveEvent.target.position.lineNumber;
			if (this.editPreferenceWidgetForMouseMove.getLine() === line && this.editPreferenceWidgetForMouseMove.isVisible()) {
				return this.editPreferenceWidgetForMouseMove;
			}
			if (this.editPreferenceWidgetForCusorPosition.getLine() === line && this.editPreferenceWidgetForCusorPosition.isVisible()) {
				return this.editPreferenceWidgetForCusorPosition;
			}
		}
		return null;
	}

	private toggleEidtPreferenceWidgetForMouseMove(mouseMoveEvent: IEditorMouseEvent): void {
		const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
		if (settings && settings.length) {
			this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
		} else {
			this.editPreferenceWidgetForMouseMove.hide();
		}
	}

	private showEditPreferencesWidget(editPreferencesWidget: EditPreferenceWidget<ISetting>, settings: ISetting[]) {
		const line = settings[0].valueRange.startLineNumber;
		if (this.editor.getConfiguration().viewInfo.glyphMargin && this.marginFreeFromOtherDecorations(line)) {
			editPreferencesWidget.show(line, nls.localize('editTtile', "Edit"), settings);
			const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCusorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCusorPosition;
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

	private getSettings(lineNumber: number): ISetting[] {
		const configurationMap = this.getConfigurationsMap();
		return this.getSettingsAtLineNumber(lineNumber).filter(setting => {
			let configurationNode = configurationMap[setting.key];
			if (configurationNode) {
				if (this.isDefaultSettings()) {
					return true;
				}
				if (configurationNode.type === 'boolean' || configurationNode.enum) {
					if ((<SettingsEditorModel>this.masterSettingsModel).configurationTarget !== ConfigurationTarget.FOLDER) {
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

	private getSettingsAtLineNumber(lineNumber: number): ISetting[] {
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
										settings.push(overrideSetting);
									}
								}
							} else {
								settings.push(setting);
							}
						}
					}
				}
			}
		}
		return settings;
	}

	private onMouseOver(editPreferenceWidget: EditPreferenceWidget<ISetting>): void {
		this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
	}

	private onEditSettingClicked(editPreferenceWidget: EditPreferenceWidget<ISetting>, e: IEditorMouseEvent): void {
		const anchor = { x: e.event.posx + 1, y: e.event.posy + 10 };
		const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key])
			: editPreferenceWidget.preferences.map(setting => new ContextSubMenu(setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions)
		});
	}

	private getConfigurationsMap(): { [qualifiedKey: string]: IConfigurationPropertySchema } {
		return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	}

	private getActions(setting: ISetting, jsonSchema: IJSONSchema): IAction[] {
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

	private getDefaultActions(setting: ISetting): IAction[] {
		const settingInOtherModel = this.associatedPreferencesModel.getPreference(setting.key);
		if (this.isDefaultSettings()) {
			return [<IAction>{
				id: 'setDefaultValue',
				label: settingInOtherModel ? nls.localize('replaceDefaultValue', "Replace in Settings") : nls.localize('copyDefaultValue', "Copy to Settings"),
				enabled: true,
				run: () => this.updateSetting(setting.key, setting.value, setting)
			}];
		}
		return [];
	}

	private updateSetting(key: string, value: any, source: ISetting): void {
		this._onUpdateSetting.fire({ key, value, source });
	}
}

class SettingHighlighter extends Disposable {

	private fixedHighlighter: RangeHighlightDecorations;
	private volatileHighlighter: RangeHighlightDecorations;
	private highlightedSetting: ISetting;

	constructor(private editor: editorCommon.ICommonCodeEditor, private focusEventEmitter: Emitter<ISetting>, private clearFocusEventEmitter: Emitter<ISetting>,
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

		this.editor.revealLinesInCenterIfOutsideViewport(setting.valueRange.startLineNumber, setting.valueRange.endLineNumber - 1);
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

class UnsupportedWorkspaceSettingsRenderer extends Disposable {

	constructor(private editor: editorCommon.ICommonCodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IMarkerService private markerService: IMarkerService
	) {
		super();
		this._register(this.configurationService.onDidUpdateConfiguration(() => this.render()));
	}

	private getMarkerMessage(settingKey): string {
		switch (settingKey) {
			case 'php.validate.executablePath':
				return nls.localize('unsupportedPHPExecutablePathSetting', "This setting must be a User Setting. To configure PHP for the workspace, open a PHP file and click on 'PHP Path' in the status bar.");
			default:
				return nls.localize('unsupportedWorkspaceSetting', "This setting must be a User Setting.");
		}
	}

	public render(): void {
		const unsupportedWorkspaceKeys = this.configurationService.getUnsupportedWorkspaceKeys();
		if (unsupportedWorkspaceKeys.length) {
			const markerData: IMarkerData[] = [];
			for (const unsupportedKey of unsupportedWorkspaceKeys) {
				const setting = this.workspaceSettingsEditorModel.getPreference(unsupportedKey);
				if (setting) {
					markerData.push({
						severity: Severity.Warning,
						startLineNumber: setting.keyRange.startLineNumber,
						startColumn: setting.keyRange.startColumn,
						endLineNumber: setting.keyRange.endLineNumber,
						endColumn: setting.keyRange.endColumn,
						message: this.getMarkerMessage(unsupportedKey)
					});
				}
			}
			if (markerData.length) {
				this.markerService.changeOne('preferencesEditor', this.workspaceSettingsEditorModel.uri, markerData);
			} else {
				this.markerService.remove('preferencesEditor', [this.workspaceSettingsEditorModel.uri]);
			}
		}
	}

	public dispose(): void {
		this.markerService.remove('preferencesEditor', [this.workspaceSettingsEditorModel.uri]);
		super.dispose();
	}
}

class UnsupportedWorkbenchSettingsRenderer extends Disposable {

	private decorationIds: string[] = [];
	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(private editor: editorCommon.ICommonCodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
	) {
		super();
		this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
	}

	public render(): void {
		const ranges: IRange[] = [];
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		for (const settingsGroup of this.workspaceSettingsEditorModel.settingsGroups) {
			for (const section of settingsGroup.sections) {
				for (const setting of section.settings) {
					if (configurationRegistry[setting.key] && configurationRegistry[setting.key].scope === ConfigurationScope.WINDOW) {
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
		this.editor.changeDecorations(changeAccessor => this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, ranges.map(range => this.createDecoration(range, this.editor.getModel()))));
	}

	private static _DIM_CONFIGUARATION_ = ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'dim-configuration',
		beforeContentClassName: 'unsupportedWorkbenhSettingInfo',
		hoverMessage: nls.localize('unsupportedWorkbenchSetting', "This setting cannot be applied now. It will be applied when you open this folder directly.")
	});

	private createDecoration(range: IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: UnsupportedWorkbenchSettingsRenderer._DIM_CONFIGUARATION_
		};
	}

	public dispose(): void {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}

class WorkspaceConfigurationRenderer extends Disposable {

	private decorationIds: string[] = [];
	private renderingDelayer: Delayer<void> = new Delayer<void>(200);

	constructor(private editor: editorCommon.ICommonCodeEditor, private workspaceSettingsEditorModel: SettingsEditorModel,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService
	) {
		super();
		this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
	}

	public render(): void {
		if (this.workspaceContextService.hasMultiFolderWorkspace()) {
			this.editor.changeDecorations(changeAccessor => this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []));

			const ranges: IRange[] = [];
			for (const settingsGroup of this.workspaceSettingsEditorModel.settingsGroups) {
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
			this.editor.changeDecorations(changeAccessor => this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, ranges.map(range => this.createDecoration(range, this.editor.getModel()))));
		}
	}

	private static _DIM_CONFIGURATION_ = ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'dim-configuration'
	});

	private createDecoration(range: IRange, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		return {
			range,
			options: WorkspaceConfigurationRenderer._DIM_CONFIGURATION_
		};
	}

	public dispose(): void {
		if (this.decorationIds) {
			this.decorationIds = this.editor.changeDecorations(changeAccessor => {
				return changeAccessor.deltaDecorations(this.decorationIds, []);
			});
		}
		super.dispose();
	}
}