/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { IAction } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import 'vs/css!./media/settingsEditor2';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachInputBoxStyler, attachSelectBoxStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions } from 'vs/workbench/common/editor';
import { SearchWidget, SettingsTargetsWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { IPreferencesService, ISetting } from 'vs/workbench/services/preferences/common/preferences';
import { PreferencesEditorInput2 } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { DefaultSettingsEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { Button } from 'vs/base/browser/ui/button/button';
import { SettingMatches } from 'vs/workbench/parts/preferences/electron-browser/preferencesSearch';

const SETTINGS_ENTRY_TEMPLATE_ID = 'settings.entry.template';
const SETTINGS_NAV_TEMPLATE_ID = 'settings.nav.template';
const SETTINGS_GROUP_ENTRY_TEMPLATE_ID = 'settings.group.template';

interface IListEntry {
	id: string;
	templateId: string;
}

interface ISettingItemEntry extends IListEntry {
	key: string;
	value: any;
	isConfigured: boolean;
	description: string;
	overriddenScopeList: string[];
	type?: string | string[];
	enum?: string[];
}

interface INavListEntry extends IListEntry {
	title: string;
	index: number;
}

interface IGroupTitleEntry extends IListEntry {
	title: string;
}

let $ = DOM.$;

export class SettingsEditor2 extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.settings2';

	private defaultSettingsEditorModel: DefaultSettingsEditorModel;

	private headerContainer: HTMLElement;
	private searchWidget: SearchWidget;
	private settingsTargetsWidget: SettingsTargetsWidget;

	private showConfiguredSettingsOnly = false;
	private showAllSettings = false;

	private settingsListContainer: HTMLElement;
	private settingsList: List<IListEntry>;

	private dimension: DOM.Dimension;
	private delayedFiltering: Delayer<void>;
	private searchFocusContextKey: IContextKey<boolean>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(SettingsEditor2.ID, telemetryService, themeService);
		this.delayedFiltering = new Delayer<void>(300);
		this._register(configurationService.onDidChangeConfiguration(() => this.render()));
	}

	createEditor(parent: HTMLElement): void {
		const prefsEditorElement = DOM.append(parent, $('div', { class: 'settings-editor' }));

		this.createHeader(prefsEditorElement);
		this.createBody(prefsEditorElement);
	}

	setInput(input: PreferencesEditorInput2, options: EditorOptions): TPromise<void> {
		const oldInput = this.input;
		return super.setInput(input)
			.then(() => {
				if (!input.matches(oldInput)) {
					this.render();
				}
			});
	}

	clearInput(): void {
		super.clearInput();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.searchWidget.layout(dimension);

		this.layoutSettingsList();
		this.render();
	}

	focus(): void {
		this.searchWidget.focus();
	}

	getSecondaryActions(): IAction[] {
		return <IAction[]>[
		];
	}

	search(filter: string): void {
		this.searchWidget.focus();
	}

	clearSearchResults(): void {
		this.searchWidget.clear();
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.settings-header'));

		const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			ariaLabel: localize('SearchSettings.AriaLabel', "Search settings"),
			placeholder: localize('SearchSettings.Placeholder', "Search settings"),
			focusKey: this.searchFocusContextKey
		}));
		this._register(this.searchWidget.onDidChange(searchValue => this.delayedFiltering.trigger(() => this.filterSettings())));

		const headerControlsContainer = DOM.append(this.headerContainer, $('div.settings-header-controls-container'));
		const targetWidgetContainer = DOM.append(headerControlsContainer, $('.settings-target-container'));
		this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer));
		this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER;
		this.settingsTargetsWidget.onDidTargetChange(e => this.renderEntries());

		this.createOpenSettingsElement(headerControlsContainer);
	}

	private createOpenSettingsElement(parent: HTMLElement): void {
		const openSettingsContainer = DOM.append(parent, $('.open-settings-container'));
		DOM.append(openSettingsContainer, $('', null, localize('header-message', "For advanced customizations open and edit")));
		const fileElement = DOM.append(openSettingsContainer, $('.file-name', null, localize('settings-file-name', "settings.json")));
		fileElement.tabIndex = 0;

		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.CLICK, () => this.preferencesService.openGlobalSettings()));
		this._register(DOM.addDisposableListener(fileElement, DOM.EventType.KEY_UP, e => {
			let keyboardEvent = new StandardKeyboardEvent(e);
			switch (keyboardEvent.keyCode) {
				case KeyCode.Enter:
					this.preferencesService.openGlobalSettings();
					keyboardEvent.preventDefault();
					keyboardEvent.stopPropagation();
					return;
			}
		}));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.settings-body'));

		const navContainer = DOM.append(bodyContainer, $('.settings-nav-container'));
		this.createNavControls(navContainer);
		// this.createNavList(navContainer);
		this.createList(bodyContainer);
	}

	private createNavControls(parent: HTMLElement): void {
		const navControls = DOM.append(parent, $('.settings-nav-controls'));
		const configuredOnlyContainer = DOM.append(navControls, $('.settings-nav-controls-configured-only'));
		const label = DOM.append(configuredOnlyContainer, $('span.settings-nav-controls-label.settings-nav-controls-configured-only'));
		label.textContent = 'Show configured settings only';

		const configuredOnlyCheckbox = new Checkbox({
			isChecked: this.showConfiguredSettingsOnly,
			onChange: e => {
				this.showConfiguredSettingsOnly = configuredOnlyCheckbox.checked;
				this.render();
			},
			actionClassName: 'settings-nav-checkbox',
			title: 'Show configured settings only'
		});

		configuredOnlyContainer.appendChild(configuredOnlyCheckbox.domNode);

		const allSettingsContainer = DOM.append(navControls, $('.settings-nav-controls-all-settings'));
		const allSettingsLabel = DOM.append(allSettingsContainer, $('span.settings-nav-controls-label'));
		allSettingsLabel.textContent = 'Show all settings';

		const allSettingsCheckbox = new Checkbox({
			isChecked: this.showAllSettings,
			onChange: e => {
				this.showAllSettings = allSettingsCheckbox.checked;
				this.render();
			},
			actionClassName: 'settings-nav-checkbox',
			title: 'Show all settings'
		});

		allSettingsContainer.appendChild(allSettingsCheckbox.domNode);
	}

	private createList(parent: HTMLElement): void {
		this.settingsListContainer = DOM.append(parent, $('.settings-list-container'));

		const settingItemRenderer = this.instantiationService.createInstance(SettingItemRenderer);
		settingItemRenderer.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.value));
		this.settingsList = this._register(this.instantiationService.createInstance(
			WorkbenchList,
			this.settingsListContainer,
			new SettingItemDelegate(),
			[settingItemRenderer, new GroupTitleRenderer()],
			{
				identityProvider: e => e.id,
				ariaLabel: localize('settingsListLabel', "Settings"),
				focusOnMouseDown: false,
				selectOnMouseDown: false,
				keyboardSupport: false,
				mouseSupport: false
			})
		) as WorkbenchList<IListEntry>;

		this.settingsList.style({ listHoverBackground: Color.transparent, listFocusOutline: Color.transparent });
	}

	private onDidChangeSetting(key: string, value: any): void {
		this.configurationService.updateValue(key, value, <ConfigurationTarget>this.settingsTargetsWidget.settingsTarget).then(
			() => this.render(),
			e => {
				// ConfigurationService displays the error
			});
	}

	private render(): TPromise<any> {
		if (this.input) {
			return this.input.resolve()
				.then((model: DefaultSettingsEditorModel) => this.defaultSettingsEditorModel = model)
				.then(() => this.renderEntries());
		}
		return TPromise.as(null);
	}

	private filterSettings(): void {
		this.renderEntries();
	}

	private renderEntries(): void {
		if (this.defaultSettingsEditorModel) {

			const filter = this.searchWidget.getValue();

			const entries: (ISettingItemEntry|IGroupTitleEntry)[] = [];
			const navEntries: INavListEntry[] = [];
			for (let groupIdx = 0; groupIdx < this.defaultSettingsEditorModel.settingsGroups.length; groupIdx++) {
				if (groupIdx > 0 && !(this.showAllSettings || filter)) {
					break;
				}

				const group = this.defaultSettingsEditorModel.settingsGroups[groupIdx];
				const groupEntries = [];
				for (const section of group.sections) {
					for (const setting of section.settings) {
						const matches = new SettingMatches(filter, setting, true, true, (filter, setting) => this.defaultSettingsEditorModel.findValueMatches(filter, setting)).matches;

						if (matches && matches.length) {
							const entry = this.settingToEntry(setting);
							if (!this.showConfiguredSettingsOnly || (this.showConfiguredSettingsOnly && entry.isConfigured)) {
								groupEntries.push(entry);
							}
						}
					}
				}

				if (groupEntries.length) {
					navEntries.push({
						id: group.id,
						index: groupIdx,
						title: group.title,
						templateId: SETTINGS_NAV_TEMPLATE_ID
					});

					entries.push(<IGroupTitleEntry>{
						id: group.id,
						templateId: SETTINGS_GROUP_ENTRY_TEMPLATE_ID,
						title: group.title
					});

					entries.push(...groupEntries);
				}
			}

			this.settingsList.splice(0, this.settingsList.length, entries);
			// this.navList.splice(0, this.navList.length, navEntries);
		}
	}

	private settingToEntry(s: ISetting): ISettingItemEntry {
		const targetSelector = this.settingsTargetsWidget.settingsTarget === ConfigurationTarget.USER ? 'user' : 'workspace';
		const inspected = this.configurationService.inspect(s.key);
		const isConfigured = typeof inspected[targetSelector] !== 'undefined';
		const displayValue = isConfigured ? inspected[targetSelector] : inspected.default;
		const overriddenScopeList = [];
		if (targetSelector === 'user' && typeof inspected.workspace !== 'undefined') {
			overriddenScopeList.push('Workspace');
		}

		if (targetSelector === 'workspace' && typeof inspected.user !== 'undefined') {
			overriddenScopeList.push('User');
		}

		return <ISettingItemEntry>{
			id: s.key,
			key: s.key,
			value: displayValue,
			isConfigured,
			overriddenScopeList,
			description: s.description.join('\n'),
			enum: s.enum,
			type: s.type,
			templateId: SETTINGS_ENTRY_TEMPLATE_ID
		};
	}

	private layoutSettingsList(): void {
		const listHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
		this.settingsListContainer.style.height = `${listHeight}px`;
		this.settingsList.layout(listHeight);
	}
}

class SettingItemDelegate implements IDelegate<IListEntry> {

	getHeight(entry: ISettingItemEntry) {
		if (entry.templateId === SETTINGS_GROUP_ENTRY_TEMPLATE_ID) {
			return 60;
		}

		if (entry.templateId === SETTINGS_ENTRY_TEMPLATE_ID) {
			// TODO dynamic height
			return 105;
		}

		return 0;
	}

	getTemplateId(element: IListEntry) {
		return element.templateId;
	}
}

interface ISettingItemTemplate {
	parent: HTMLElement;
	toDispose: IDisposable[];

	containerElement: HTMLElement;
	labelElement: HTMLElement;
	keyElement: HTMLElement;
	descriptionElement: HTMLElement;
	valueElement: HTMLElement;
	overridesElement: HTMLElement;
}

interface INavItemTemplate {
	parent: HTMLElement;

	labelElement: HTMLElement;
}

interface IGroupTitleItemTemplate {
	parent: HTMLElement;

	labelElement: HTMLElement;
}

interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset unconfigure
}

class SettingItemRenderer implements IRenderer<ISettingItemEntry, ISettingItemTemplate> {

	/**
	 * TODO@roblou This shouldn't exist. List items should have actions or something
	 */
	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	get templateId(): string { return SETTINGS_ENTRY_TEMPLATE_ID; }

	constructor(
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) { }

	renderTemplate(parent: HTMLElement): ISettingItemTemplate {
		DOM.addClass(parent, 'setting-item');

		const itemContainer = DOM.append(parent, $('div.setting-item-container'));
		const leftElement = DOM.append(itemContainer, $('.setting-item-left'));
		const rightElement = DOM.append(itemContainer, $('.setting-item-right'));

		const titleElement = DOM.append(leftElement, $('div.setting-item-title'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const keyElement = DOM.append(titleElement, $('span.setting-item-key'));
		const descriptionElement = DOM.append(leftElement, $('div.setting-item-description'));

		const valueElement = DOM.append(rightElement, $('div.setting-item-value'));
		const overridesElement = DOM.append(rightElement, $('div.setting-item-overrides'));

		return {
			parent: parent,
			toDispose: [],

			containerElement: itemContainer,
			keyElement,
			labelElement,
			descriptionElement,
			valueElement,
			overridesElement
		};
	}

	renderElement(entry: ISettingItemEntry, index: number, template: ISettingItemTemplate): void {
		DOM.toggleClass(template.parent, 'odd', index % 2 === 1);

		template.keyElement.textContent = entry.key;
		template.labelElement.textContent = settingKeyToLabel(entry.key);
		template.descriptionElement.textContent = entry.description;

		DOM.toggleClass(template.parent, 'is-configured', entry.isConfigured);
		this.renderValue(entry, template);

		const resetButton = new Button(template.valueElement);
		resetButton.element.classList.add('setting-reset-button');
		attachButtonStyler(resetButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString()
		});
		template.toDispose.push(resetButton.onDidClick(e => {
			this._onDidChangeSetting.fire({ key: entry.key, value: undefined });
		}));
		template.toDispose.push(resetButton);

		template.overridesElement.textContent = entry.overriddenScopeList.length ? 'Also configured in: ' + entry.overriddenScopeList.join(', ') :
			'';
	}

	private renderValue(entry: ISettingItemEntry, template: ISettingItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: entry.key, value });
		template.valueElement.innerHTML = '';
		if (entry.type === 'string' && entry.enum) {
			this.renderEnum(entry, template, onChange);
		} else if (entry.type === 'boolean') {
			this.renderBool(entry, template, onChange);
		} else if (entry.type === 'string') {
			this.renderText(entry, template, onChange);
		} else if (entry.type === 'number') {
			this.renderText(entry, template, value => onChange(parseInt(value)));
		} else {
			template.valueElement.textContent = 'Edit in settings.json!';
		}
	}

	private renderBool(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: boolean) => void): void {
		const checkbox = new Checkbox({
			isChecked: entry.value,
			title: entry.key,
			onChange: e => onChange(checkbox.checked),
			actionClassName: 'setting-value-checkbox'
		});
		template.toDispose.push(checkbox);

		template.valueElement.appendChild(checkbox.domNode);
	}

	private renderEnum(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: string) => void): void {
		const idx = entry.enum.indexOf(entry.value);
		const selectBox = new SelectBox(entry.enum, idx, this.contextViewService);
		template.toDispose.push(selectBox);
		template.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService));
		selectBox.render(template.valueElement);

		template.toDispose.push(
			selectBox.onDidSelect(e => onChange(entry.enum[e.index])));
	}

	private renderText(entry: ISettingItemEntry, template: ISettingItemTemplate, onChange: (value: string) => void): void {
		const inputBox = new InputBox(template.valueElement, this.contextViewService);
		template.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
		}));
		template.toDispose.push(inputBox);
		inputBox.value = entry.value;

		template.toDispose.push(
			inputBox.onDidChange(e => onChange(e)));
	}

	disposeTemplate(template: ISettingItemTemplate): void {
		dispose(template.toDispose);
	}
}

class GroupTitleRenderer implements IRenderer<IGroupTitleEntry, IGroupTitleItemTemplate> {

	get templateId(): string { return SETTINGS_GROUP_ENTRY_TEMPLATE_ID; }

	constructor(
	) { }

	renderTemplate(parent: HTMLElement): INavItemTemplate {
		DOM.addClass(parent, 'group-title');

		const labelElement = DOM.append(parent, $('h2.group-title-label'));
		return {
			parent: parent,
			labelElement
		};
	}

	renderElement(entry: IGroupTitleEntry, index: number, template: IGroupTitleItemTemplate): void {
		template.labelElement.textContent = entry.title;
	}

	disposeTemplate(template: ISettingItemTemplate): void {
		dispose(template.toDispose);
	}
}

function settingKeyToLabel(key: string): string {
	const lastDotIdx = key.lastIndexOf('.');
	if (lastDotIdx >= 0) {
		key = key.substr(0, lastDotIdx) + ': ' + key.substr(lastDotIdx + 1);
	}

	return key
		.replace(/\.([a-z])/, (match, p1) => `.${p1.toUpperCase()}`)
		.replace(/([a-z])([A-Z])/g, '$1 $2') // fooBar => foo Bar
		.replace(/^[a-z]/g, match => match.toUpperCase()) // foo => Foo
		.replace(/ [a-z]/g, match => match.toUpperCase()); // Foo bar => Foo Bar
}

// registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
// 	const listHighlightForegroundColor = theme.getColor(listHighlightForeground);
// 	if (listHighlightForegroundColor) {
// 		collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-list-container .monaco-list-row > .column .highlight { color: ${listHighlightForegroundColor}; }`);
// 	}
// });
