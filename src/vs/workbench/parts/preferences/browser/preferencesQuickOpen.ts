/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { LinkedMap as Map } from 'vs/base/common/map';
import { IPreferencesService, ISetting, ISettingsGroup } from 'vs/workbench/parts/preferences/common/preferences';
import { IAutoFocus, Mode, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { Registry } from 'vs/platform/platform';
import { IRange } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup, IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { DefaultSettingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

export class SettingHandler extends QuickOpenHandler {

	constructor(
		private configurationTarget: ConfigurationTarget,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();
	}

	getResults(text: string): TPromise<IModel<QuickOpenEntry>> {
		if (this.configurationTarget === ConfigurationTarget.WORKSPACE && !this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return;
		}
		return this.preferencesService.getDefaultSettingsEditorModel()
			.then(defaultsSettingsEditorModel => this.filterSettings(text, <DefaultSettingsEditorModel>defaultsSettingsEditorModel));
	}

	private filterSettings(text: string, defailtsSettingsEditorModel: DefaultSettingsEditorModel): IModel<QuickOpenEntry> {
		if (text) {
			const filterResult = defailtsSettingsEditorModel.filterSettings(text);
			filterResult.filteredGroups.sort(SettingHandler.compareGroups);
			const result: QuickOpenEntry[] = this.toQuickOpenEntries(filterResult.filteredGroups, filterResult.matches);
			return new QuickOpenModel(result);
		}
		const result: QuickOpenEntry[] = this.toQuickOpenEntries([defailtsSettingsEditorModel.mostCommonlyUsedSettings]);
		return new QuickOpenModel(result);
	}

	private static compareGroups(a: ISettingsGroup, b: ISettingsGroup): number {
		const count1 = a.sections.reduce((c, section) => c + section.settings.length, 0);
		const count2 = b.sections.reduce((c, section) => c + section.settings.length, 0);
		return count1 > count2 ? -1 : 1;
	}

	private toQuickOpenEntries(settingsGroups: ISettingsGroup[], matches: Map<string, IRange[]> = new Map<string, IRange[]>()): SimpleEntry[] {
		const result: SimpleEntry[] = [];
		for (const group of settingsGroups) {
			const groupResult: SimpleEntry[] = [];
			for (const section of group.sections) {
				groupResult.push(...section.settings.map(setting => this.toQuickOpenEntry(setting, matches.get(group.title + setting.key))));
			}
			groupResult[0].setGroupLabel(group.title + `(${groupResult.length})`);
			if (result.length > 0) {
				groupResult[0].setShowBorder(true);
			}
			result.push(...groupResult);
		}
		return result;
	}

	private toQuickOpenEntry(setting: ISetting, settingMatches: IRange[]): SimpleEntry {
		const entry = new SimpleEntry(setting, this.pickValue.bind(this));
		if (settingMatches) {
			entry.setHighlights(settingMatches.map(match => this.toHighlight(match, setting)).filter(hightlight => !!hightlight));
		}
		return entry;
	}

	private toHighlight(match: IRange, setting: ISetting): IHighlight {
		if (Range.containsRange(setting.keyRange, match)) {
			return {
				start: match.startColumn - setting.keyRange.startColumn,
				end: match.endColumn - setting.keyRange.startColumn
			};
		}
		return null;
	}

	public pickValue(setting: ISetting) {
		this.getValue(setting).then(value => {
			if (value !== null && value !== void 0) {
				this.preferencesService.copyConfiguration({ key: setting.key, value }, this.configurationTarget);
			}
		});
	}

	private getValue(setting: ISetting): TPromise<any> {
		const schema = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[setting.key];
		if (schema.enum) {
			return this.showEnumValues(setting, schema.enum, <string>schema.type);
		}
		if (schema.type === 'boolean') {
			return this.showBooleanValues(setting);
		}
		if (schema.type === 'number') {
			return this.showNumberValues(setting);
		}
		if (schema.type === 'string') {
			return this.showStringValue(setting);
		}
		if (schema.type === 'object') {
			return this.pickEmptyOrDefault(setting, {});
		}
		if (schema.type === 'array') {
			return this.pickEmptyOrDefault(setting, []);
		}
		return TPromise.wrap(setting.value);
	}

	private showEnumValues(setting: ISetting, values: string[], type: string): TPromise<any> {
		const entries = values.map(value => {
			return {
				label: value,
				icon: type
			};
		});
		return this.quickOpenService.pick(entries, {
			placeHolder: localize('pickValuePlaceHolder', "Pick value for {0}", setting.key)
		}).then(entry => entry ? entry.label : null);
	}

	private showBooleanValues(setting: ISetting): TPromise<any> {
		const truthyValue: IPickOpenEntry = {
			label: 'true',
			icon: 'boolean'
		};
		const falsyValue: IPickOpenEntry = {
			label: 'false',
			icon: 'boolean'
		};
		return this.quickOpenService.pick([truthyValue, falsyValue])
			.then(value => value === truthyValue, error => null);
	}

	private showNumberValues(setting: ISetting) {
		return this.quickOpenService.input({
			placeHolder: localize('numberInputPlaceholder', "Enter a number value"),
			prompt: localize('numberInputDefaultValue', "Default value '{0}'", setting.value),
			value: setting.value
		}).then(value => value ? parseInt(value) : value);
	}

	private showStringValue(setting: ISetting) {
		return this.quickOpenService.input({
			placeHolder: localize('stringInputPlaceholder', "Enter value"),
			prompt: localize('stringInputDefaultValue', "Default value '{0}'", setting.value)
		});
	}

	private pickEmptyOrDefault(setting: ISetting, emptyValue: any) {
		const defaultValueEntry: IPickOpenEntry = {
			alwaysShow: true,
			id: 'defaultValue',
			label: localize('defaultValue', "Default Value"),
		};
		const emptyValueEntry: IPickOpenEntry = {
			alwaysShow: true,
			id: 'emptyValue',
			label: localize('emptyValue', "Empty Value"),
		};
		return this.quickOpenService.pick([emptyValueEntry, defaultValueEntry])
			.then(value => value.id === 'defaultValue' ? setting.value : emptyValue);
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}

export class UserSettingHandler extends SettingHandler {
	public static QUICK_OPEN_PREFIX = 'set user ';
	constructor(
		@IPreferencesService preferencesService: IPreferencesService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(ConfigurationTarget.USER, preferencesService, quickOpenService, messageService, contextService);
	}
}

export class WorkspaceSettingHandler extends SettingHandler {
	public static QUICK_OPEN_PREFIX = 'set workspace ';
	constructor(
		@IPreferencesService preferencesService: IPreferencesService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(ConfigurationTarget.WORKSPACE, preferencesService, quickOpenService, messageService, contextService);
	}
}

export class SimpleEntry extends QuickOpenEntryGroup {

	constructor(private setting: ISetting, private onSelect: Function) {
		super();
	}

	getLabel(): string {
		return this.setting.key;
	}

	getDetail(): string {
		return this.setting.description;
	}

	getAriaLabel(): string {
		return this.setting.description;
	}

	getLabelOptions(): IIconLabelOptions {
		return {
			title: this.setting.description
		};
	}

	public getIcon(): string {
		return 'property';
	}

	public run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}
		this.onSelect(this.setting);
		return false;
	}

}

export class LabelEntry extends QuickOpenEntry {
	constructor(private label: string, private onSelect: Function) {
		super();
	}

	getLabel(): string {
		return this.label;
	}

	public run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}
		this.onSelect(this.label);
		return false;
	}
}