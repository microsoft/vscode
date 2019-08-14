/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert as ariaAlert } from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IListVirtualDelegate, ListAriaRootRole } from 'vs/base/browser/ui/list/list';
import { DefaultStyleController } from 'vs/base/browser/ui/list/listWidget';
import { ISelectOptionItem, SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IObjectTreeOptions, ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { ITreeFilter, ITreeModel, ITreeNode, ITreeRenderer, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { Action, IAction } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ISpliceable } from 'vs/base/common/sequence';
import { escapeRegExpCharacters, startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorBackground, errorForeground, focusBorder, foreground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ITOCEntry } from 'vs/workbench/contrib/preferences/browser/settingsLayout';
import { ISettingsEditorViewState, settingKeyToDisplayFormat, SettingsTreeElement, SettingsTreeGroupChild, SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { ListSettingWidget, IListChangeEvent, IListDataItem, settingsHeaderForeground, settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground, ExcludeSettingWidget } from 'vs/workbench/contrib/preferences/browser/settingsWidgets';
import { SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU } from 'vs/workbench/contrib/preferences/common/preferences';
import { ISetting, ISettingsGroup, SettingValueType } from 'vs/workbench/services/preferences/common/preferences';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isArray } from 'vs/base/common/types';

const $ = DOM.$;

function getExcludeDisplayValue(element: SettingsTreeSettingElement): IListDataItem[] {
	const data = element.isConfigured ?
		{ ...element.defaultValue, ...element.scopeValue } :
		element.defaultValue;

	return Object.keys(data)
		.filter(key => !!data[key])
		.map(key => {
			const value = data[key];
			const sibling = typeof value === 'boolean' ? undefined : value.when;

			return {
				id: key,
				value: key,
				sibling
			};
		});
}

function getListDisplayValue(element: SettingsTreeSettingElement): IListDataItem[] {
	if (!element.value || !isArray(element.value)) {
		return [];
	}

	return element.value.map((key: string) => {
		return {
			value: key
		};
	});
}

export function resolveSettingsTree(tocData: ITOCEntry, coreSettingsGroups: ISettingsGroup[]): { tree: ITOCEntry, leftoverSettings: Set<ISetting> } {
	const allSettings = getFlatSettings(coreSettingsGroups);
	return {
		tree: _resolveSettingsTree(tocData, allSettings),
		leftoverSettings: allSettings
	};
}

export function resolveExtensionsSettings(groups: ISettingsGroup[]): ITOCEntry {
	const settingsGroupToEntry = (group: ISettingsGroup) => {
		const flatSettings = arrays.flatten(
			group.sections.map(section => section.settings));

		return {
			id: group.id,
			label: group.title,
			settings: flatSettings
		};
	};

	const extGroups = groups
		.sort((a, b) => a.title.localeCompare(b.title))
		.map(g => settingsGroupToEntry(g));

	return {
		id: 'extensions',
		label: localize('extensions', "Extensions"),
		children: extGroups
	};
}

function _resolveSettingsTree(tocData: ITOCEntry, allSettings: Set<ISetting>): ITOCEntry {
	let children: ITOCEntry[] | undefined;
	if (tocData.children) {
		children = tocData.children
			.map(child => _resolveSettingsTree(child, allSettings))
			.filter(child => (child.children && child.children.length) || (child.settings && child.settings.length));
	}

	let settings: ISetting[] | undefined;
	if (tocData.settings) {
		settings = arrays.flatten(tocData.settings.map(pattern => getMatchingSettings(allSettings, <string>pattern)));
	}

	if (!children && !settings) {
		throw new Error(`TOC node has no child groups or settings: ${tocData.id}`);
	}

	return {
		id: tocData.id,
		label: tocData.label,
		children,
		settings
	};
}

function getMatchingSettings(allSettings: Set<ISetting>, pattern: string): ISetting[] {
	const result: ISetting[] = [];

	allSettings.forEach(s => {
		if (settingMatches(s, pattern)) {
			result.push(s);
			allSettings.delete(s);
		}
	});


	return result.sort((a, b) => a.key.localeCompare(b.key));
}

const settingPatternCache = new Map<string, RegExp>();

function createSettingMatchRegExp(pattern: string): RegExp {
	pattern = escapeRegExpCharacters(pattern)
		.replace(/\\\*/g, '.*');

	return new RegExp(`^${pattern}`, 'i');
}

function settingMatches(s: ISetting, pattern: string): boolean {
	let regExp = settingPatternCache.get(pattern);
	if (!regExp) {
		regExp = createSettingMatchRegExp(pattern);
		settingPatternCache.set(pattern, regExp);
	}

	return regExp.test(s.key);
}

function getFlatSettings(settingsGroups: ISettingsGroup[]) {
	const result: Set<ISetting> = new Set();

	for (const group of settingsGroups) {
		for (const section of group.sections) {
			for (const s of section.settings) {
				if (!s.overrides || !s.overrides.length) {
					result.add(s);
				}
			}
		}
	}

	return result;
}

interface IDisposableTemplate {
	toDispose: IDisposable[];
}

interface ISettingItemTemplate<T = any> extends IDisposableTemplate {
	onChange?: (value: T) => void;

	context?: SettingsTreeSettingElement;
	containerElement: HTMLElement;
	categoryElement: HTMLElement;
	labelElement: HTMLElement;
	descriptionElement: HTMLElement;
	controlElement: HTMLElement;
	deprecationWarningElement: HTMLElement;
	otherOverridesElement: HTMLElement;
	toolbar: ToolBar;
}

interface ISettingBoolItemTemplate extends ISettingItemTemplate<boolean> {
	checkbox: Checkbox;
}

interface ISettingTextItemTemplate extends ISettingItemTemplate<string> {
	inputBox: InputBox;
	validationErrorMessageElement: HTMLElement;
}

type ISettingNumberItemTemplate = ISettingTextItemTemplate;

interface ISettingEnumItemTemplate extends ISettingItemTemplate<number> {
	selectBox: SelectBox;
	enumDescriptionElement: HTMLElement;
}

interface ISettingComplexItemTemplate extends ISettingItemTemplate<void> {
	button: Button;
}

interface ISettingListItemTemplate extends ISettingItemTemplate<void> {
	listWidget: ListSettingWidget;
}

interface ISettingExcludeItemTemplate extends ISettingItemTemplate<void> {
	excludeWidget: ListSettingWidget;
}

interface ISettingNewExtensionsTemplate extends IDisposableTemplate {
	button: Button;
	context?: SettingsTreeNewExtensionsElement;
}

interface IGroupTitleTemplate extends IDisposableTemplate {
	context?: SettingsTreeGroupElement;
	parent: HTMLElement;
}

const SETTINGS_TEXT_TEMPLATE_ID = 'settings.text.template';
const SETTINGS_NUMBER_TEMPLATE_ID = 'settings.number.template';
const SETTINGS_ENUM_TEMPLATE_ID = 'settings.enum.template';
const SETTINGS_BOOL_TEMPLATE_ID = 'settings.bool.template';
const SETTINGS_ARRAY_TEMPLATE_ID = 'settings.array.template';
const SETTINGS_EXCLUDE_TEMPLATE_ID = 'settings.exclude.template';
const SETTINGS_COMPLEX_TEMPLATE_ID = 'settings.complex.template';
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = 'settings.newExtensions.template';
const SETTINGS_ELEMENT_TEMPLATE_ID = 'settings.group.template';

export interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset/unconfigure
	type: SettingValueType | SettingValueType[];
}

export interface ISettingLinkClickEvent {
	source: SettingsTreeSettingElement;
	targetKey: string;
}

export interface ISettingOverrideClickEvent {
	scope: string;
	targetKey: string;
}

export abstract class AbstractSettingRenderer extends Disposable implements ITreeRenderer<SettingsTreeElement, never, any> {
	/** To override */
	abstract get templateId(): string;

	static readonly CONTROL_CLASS = 'setting-control-focus-target';
	static readonly CONTROL_SELECTOR = '.' + AbstractSettingRenderer.CONTROL_CLASS;
	static readonly CONTENTS_CLASS = 'setting-item-contents';
	static readonly CONTENTS_SELECTOR = '.' + AbstractSettingRenderer.CONTENTS_CLASS;

	static readonly SETTING_KEY_ATTR = 'data-key';
	static readonly SETTING_ID_ATTR = 'data-id';

	private readonly _onDidClickOverrideElement = this._register(new Emitter<ISettingOverrideClickEvent>());
	readonly onDidClickOverrideElement: Event<ISettingOverrideClickEvent> = this._onDidClickOverrideElement.event;

	protected readonly _onDidChangeSetting = this._register(new Emitter<ISettingChangeEvent>());
	readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	protected readonly _onDidOpenSettings = this._register(new Emitter<string>());
	readonly onDidOpenSettings: Event<string> = this._onDidOpenSettings.event;

	private readonly _onDidClickSettingLink = this._register(new Emitter<ISettingLinkClickEvent>());
	readonly onDidClickSettingLink: Event<ISettingLinkClickEvent> = this._onDidClickSettingLink.event;

	private readonly _onDidFocusSetting = this._register(new Emitter<SettingsTreeSettingElement>());
	readonly onDidFocusSetting: Event<SettingsTreeSettingElement> = this._onDidFocusSetting.event;

	// Put common injections back here
	constructor(
		private readonly settingActions: IAction[],
		@IThemeService protected readonly _themeService: IThemeService,
		@IContextViewService protected readonly _contextViewService: IContextViewService,
		@IOpenerService protected readonly _openerService: IOpenerService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@ICommandService protected readonly _commandService: ICommandService,
		@IContextMenuService protected readonly _contextMenuService: IContextMenuService,
		@IKeybindingService protected readonly _keybindingService: IKeybindingService,
	) {
		super();
	}

	renderTemplate(container: HTMLElement): any {
		throw new Error('to override');
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: any): void {
		throw new Error('to override');
	}

	protected renderCommonTemplate(tree: any, _container: HTMLElement, typeClass: string): ISettingItemTemplate {
		DOM.addClass(_container, 'setting-item');
		DOM.addClass(_container, 'setting-item-' + typeClass);

		const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
		const titleElement = DOM.append(container, $('.setting-item-title'));
		const labelCategoryContainer = DOM.append(titleElement, $('.setting-item-cat-label-container'));
		const categoryElement = DOM.append(labelCategoryContainer, $('span.setting-item-category'));
		const labelElement = DOM.append(labelCategoryContainer, $('span.setting-item-label'));
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));
		const descriptionElement = DOM.append(container, $('.setting-item-description'));
		const modifiedIndicatorElement = DOM.append(container, $('.setting-item-modified-indicator'));
		modifiedIndicatorElement.title = localize('modified', "Modified");

		const valueElement = DOM.append(container, $('.setting-item-value'));
		const controlElement = DOM.append(valueElement, $('div.setting-item-control'));

		const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));

		const toDispose: IDisposable[] = [];

		const toolbarContainer = DOM.append(container, $('.setting-toolbar-container'));
		const toolbar = this.renderSettingToolbar(toolbarContainer);

		const template: ISettingItemTemplate = {
			toDispose,

			containerElement: container,
			categoryElement,
			labelElement,
			descriptionElement,
			controlElement,
			deprecationWarningElement,
			otherOverridesElement,
			toolbar
		};

		// Prevent clicks from being handled by list
		toDispose.push(DOM.addDisposableListener(controlElement, 'mousedown', e => e.stopPropagation()));

		toDispose.push(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, e => container.classList.add('mouseover')));
		toDispose.push(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, e => container.classList.remove('mouseover')));

		return template;
	}

	protected addSettingElementFocusHandler(template: ISettingItemTemplate): void {
		const focusTracker = DOM.trackFocus(template.containerElement);
		template.toDispose.push(focusTracker);
		focusTracker.onDidBlur(() => {
			if (template.containerElement.classList.contains('focused')) {
				template.containerElement.classList.remove('focused');
			}
		});

		focusTracker.onDidFocus(() => {
			template.containerElement.classList.add('focused');

			if (template.context) {
				this._onDidFocusSetting.fire(template.context);
			}
		});
	}

	protected renderSettingToolbar(container: HTMLElement): ToolBar {
		const toggleMenuKeybinding = this._keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU);
		let toggleMenuTitle = localize('settingsContextMenuTitle', "More Actions... ");
		if (toggleMenuKeybinding) {
			toggleMenuTitle += ` (${toggleMenuKeybinding && toggleMenuKeybinding.getLabel()})`;
		}

		const toolbar = new ToolBar(container, this._contextMenuService, {
			toggleMenuTitle
		});
		toolbar.setActions([], this.settingActions)();
		const button = container.querySelector('.toolbar-toggle-more');
		if (button) {
			(<HTMLElement>button).tabIndex = -1;
		}

		return toolbar;
	}

	protected renderSettingElement(node: ITreeNode<SettingsTreeSettingElement, never>, index: number, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		const element = node.element;
		template.context = element;
		template.toolbar.context = element;

		const setting = element.setting;

		DOM.toggleClass(template.containerElement, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.containerElement, 'is-expanded', true);
		template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR, element.setting.key);
		template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_ID_ATTR, element.id);

		const titleTooltip = setting.key + (element.isConfigured ? ' - Modified' : '');
		template.categoryElement.textContent = element.displayCategory && (element.displayCategory + ': ');
		template.categoryElement.title = titleTooltip;

		template.labelElement.textContent = element.displayLabel;
		template.labelElement.title = titleTooltip;

		template.descriptionElement.innerHTML = '';
		if (element.setting.descriptionIsMarkdown) {
			const disposables = new DisposableStore();
			template.toDispose.push(disposables);
			const renderedDescription = this.renderDescriptionMarkdown(element, element.description, disposables);
			template.descriptionElement.appendChild(renderedDescription);
		} else {
			template.descriptionElement.innerText = element.description;
		}

		const baseId = (element.displayCategory + '_' + element.displayLabel).replace(/ /g, '_').toLowerCase();
		template.descriptionElement.id = baseId + '_setting_description';

		template.otherOverridesElement.innerHTML = '';

		if (element.overriddenScopeList.length) {
			const otherOverridesLabel = element.isConfigured ?
				localize('alsoConfiguredIn', "Also modified in") :
				localize('configuredIn', "Modified in");

			DOM.append(template.otherOverridesElement, $('span', undefined, `(${otherOverridesLabel}: `));

			for (let i = 0; i < element.overriddenScopeList.length; i++) {
				const view = DOM.append(template.otherOverridesElement, $('a.modified-scope', undefined, element.overriddenScopeList[i]));

				if (i !== element.overriddenScopeList.length - 1) {
					DOM.append(template.otherOverridesElement, $('span', undefined, ', '));
				} else {
					DOM.append(template.otherOverridesElement, $('span', undefined, ')'));
				}

				DOM.addStandardDisposableListener(view, DOM.EventType.CLICK, (e: IMouseEvent) => {
					this._onDidClickOverrideElement.fire({
						targetKey: element.setting.key,
						scope: element.overriddenScopeList[i]
					});
					e.preventDefault();
					e.stopPropagation();
				});
			}
		}

		const onChange = (value: any) => this._onDidChangeSetting.fire({ key: element.setting.key, value, type: template.context!.valueType });
		template.deprecationWarningElement.innerText = element.setting.deprecationMessage || '';
		this.renderValue(element, <ISettingItemTemplate>template, onChange);

	}

	private renderDescriptionMarkdown(element: SettingsTreeSettingElement, text: string, disposeables: DisposableStore): HTMLElement {
		// Rewrite `#editor.fontSize#` to link format
		text = fixSettingLinks(text);

		const renderedMarkdown = renderMarkdown({ value: text }, {
			actionHandler: {
				callback: (content: string) => {
					if (startsWith(content, '#')) {
						const e: ISettingLinkClickEvent = {
							source: element,
							targetKey: content.substr(1)
						};
						this._onDidClickSettingLink.fire(e);
					} else {
						let uri: URI | undefined;
						try {
							uri = URI.parse(content);
						} catch (err) {
							// ignore
						}
						if (uri) {
							this._openerService.open(uri).catch(onUnexpectedError);
						}
					}
				},
				disposeables
			}
		});

		renderedMarkdown.classList.add('setting-item-description-markdown');
		cleanRenderedMarkdown(renderedMarkdown);
		return renderedMarkdown;
	}

	protected abstract renderValue(dataElement: SettingsTreeSettingElement, template: ISettingItemTemplate, onChange: (value: any) => void): void;

	protected setElementAriaLabels(dataElement: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate): string {
		// Create base Id for element references
		const baseId = (dataElement.displayCategory + '_' + dataElement.displayLabel).replace(/ /g, '_').toLowerCase();

		const modifiedText = template.otherOverridesElement.textContent ?
			template.otherOverridesElement.textContent : (dataElement.isConfigured ? localize('settings.Modified', ' Modified. ') : '');

		let itemElement: HTMLElement | null = null;

		// Use '.' as reader pause
		let label = dataElement.displayCategory + ' ' + dataElement.displayLabel + '. ';

		// Setup and add ARIA attributes
		// Create id and label for control/input element - parent is wrapper div

		if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			if (itemElement = (<ISettingTextItemTemplate>template).inputBox.inputElement) {
				itemElement.setAttribute('role', 'textbox');
				label += modifiedText;
			}
		} else if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			if (itemElement = (<ISettingNumberItemTemplate>template).inputBox.inputElement) {
				itemElement.setAttribute('role', 'textbox');
				label += ' number. ' + modifiedText;
			}
		} else if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			if (itemElement = (<ISettingBoolItemTemplate>template).checkbox.domNode) {
				itemElement.setAttribute('role', 'checkbox');
				label += modifiedText;
				// Add checkbox target to description clickable and able to toggle checkbox
				template.descriptionElement.setAttribute('checkbox_label_target_id', baseId + '_setting_item');
			}
		} else if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			if (itemElement = <HTMLElement>template.controlElement.firstElementChild) {
				itemElement.setAttribute('role', 'combobox');
				label += modifiedText;
			}
		} else {
			// Don't change attributes if we don't know what we areFunctions
			return '';
		}

		// We don't have control element, return empty label
		if (!itemElement) {
			return '';
		}

		// Labels will not be read on descendent input elements of the parent treeitem
		// unless defined as roles for input items
		// voiceover does not seem to use labeledby correctly, set labels directly on input elements
		itemElement.id = baseId + '_setting_item';
		itemElement.setAttribute('aria-label', label);
		itemElement.setAttribute('aria-describedby', baseId + '_setting_description settings_aria_more_actions_shortcut_label');

		return label;
	}

	disposeTemplate(template: IDisposableTemplate): void {
		dispose(template.toDispose);
	}
}

export class SettingGroupRenderer implements ITreeRenderer<SettingsTreeGroupElement, never, IGroupTitleTemplate> {
	templateId = SETTINGS_ELEMENT_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IGroupTitleTemplate {
		DOM.addClass(container, 'group-title');

		const toDispose: IDisposable[] = [];
		const template: IGroupTitleTemplate = {
			parent: container,
			toDispose
		};

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeGroupElement, never>, index: number, templateData: IGroupTitleTemplate): void {
		templateData.parent.innerHTML = '';
		const labelElement = DOM.append(templateData.parent, $('div.settings-group-title-label'));
		labelElement.classList.add(`settings-group-level-${element.element.level}`);
		labelElement.textContent = element.element.label;

		if (element.element.isFirstGroup) {
			labelElement.classList.add('settings-group-first');
		}
	}

	disposeTemplate(templateData: IGroupTitleTemplate): void {
	}
}

export class SettingNewExtensionsRenderer implements ITreeRenderer<SettingsTreeNewExtensionsElement, never, ISettingNewExtensionsTemplate> {
	templateId = SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
	}

	renderTemplate(container: HTMLElement): ISettingNewExtensionsTemplate {
		const toDispose: IDisposable[] = [];

		container.classList.add('setting-item-new-extensions');

		const button = new Button(container, { title: true, buttonBackground: undefined, buttonHoverBackground: undefined });
		toDispose.push(button);
		toDispose.push(button.onDidClick(() => {
			if (template.context) {
				this._commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', template.context.extensionIds);
			}
		}));
		button.label = localize('newExtensionsButtonLabel', "Show matching extensions");
		button.element.classList.add('settings-new-extensions-button');
		toDispose.push(attachButtonStyler(button, this._themeService));

		const template: ISettingNewExtensionsTemplate = {
			button,
			toDispose
		};

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeNewExtensionsElement, never>, index: number, templateData: ISettingNewExtensionsTemplate): void {
		templateData.context = element.element;
	}

	disposeTemplate(template: IDisposableTemplate): void {
		dispose(template.toDispose);
	}
}

export class SettingComplexRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingComplexItemTemplate> {
	templateId = SETTINGS_COMPLEX_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISettingComplexItemTemplate {
		const common = this.renderCommonTemplate(null, container, 'complex');

		const openSettingsButton = new Button(common.controlElement, { title: true, buttonBackground: undefined, buttonHoverBackground: undefined });
		common.toDispose.push(openSettingsButton);
		common.toDispose.push(openSettingsButton.onDidClick(() => template.onChange!()));
		openSettingsButton.label = localize('editInSettingsJson', "Edit in settings.json");
		openSettingsButton.element.classList.add('edit-in-settings-button');

		common.toDispose.push(attachButtonStyler(openSettingsButton, this._themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: 'foreground'
		}));

		const template: ISettingComplexItemTemplate = {
			...common,
			button: openSettingsButton
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingComplexItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingExcludeItemTemplate, onChange: (value: string) => void): void {
		template.onChange = () => this._onDidOpenSettings.fire(dataElement.setting.key);
	}
}

export class SettingArrayRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingListItemTemplate> {
	templateId = SETTINGS_ARRAY_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISettingListItemTemplate {
		const common = this.renderCommonTemplate(null, container, 'list');

		const listWidget = this._instantiationService.createInstance(ListSettingWidget, common.controlElement);
		listWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
		common.toDispose.push(listWidget);

		const template: ISettingListItemTemplate = {
			...common,
			listWidget
		};

		this.addSettingElementFocusHandler(template);

		common.toDispose.push(listWidget.onDidChangeList(e => this.onDidChangeList(template, e)));

		return template;
	}

	private onDidChangeList(template: ISettingListItemTemplate, e: IListChangeEvent): void {
		if (template.context) {
			let newValue: any[] = [];
			if (isArray(template.context.scopeValue)) {
				newValue = [...template.context.scopeValue];
			} else if (isArray(template.context.value)) {
				newValue = [...template.context.value];
			}

			if (e.targetIndex !== undefined) {
				// Delete value
				if (!e.value && e.originalValue && e.targetIndex > -1) {
					newValue.splice(e.targetIndex, 1);
				}
				// Update value
				else if (e.value && e.originalValue) {
					if (e.targetIndex > -1) {
						newValue[e.targetIndex] = e.value;
					}
					// For some reason, we are updating and cannot find original value
					// Just append the value in this case
					else {
						newValue.push(e.value);
					}
				}
				// Add value
				else if (e.value && !e.originalValue && e.targetIndex >= newValue.length) {
					newValue.push(e.value);
				}
			}
			if (
				template.context.defaultValue &&
				isArray(template.context.defaultValue) &&
				template.context.defaultValue.length === newValue.length &&
				template.context.defaultValue.join() === newValue.join()
			) {
				return this._onDidChangeSetting.fire({
					key: template.context.setting.key,
					value: undefined, // reset setting
					type: template.context.valueType
				});
			}

			this._onDidChangeSetting.fire({
				key: template.context.setting.key,
				value: newValue,
				type: template.context.valueType
			});
		}
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingListItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingListItemTemplate, onChange: (value: string) => void): void {
		const value = getListDisplayValue(dataElement);
		template.listWidget.setValue(value);
		template.context = dataElement;
	}
}

export class SettingExcludeRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingExcludeItemTemplate> {
	templateId = SETTINGS_EXCLUDE_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISettingExcludeItemTemplate {
		const common = this.renderCommonTemplate(null, container, 'list');

		const excludeWidget = this._instantiationService.createInstance(ExcludeSettingWidget, common.controlElement);
		excludeWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
		common.toDispose.push(excludeWidget);

		const template: ISettingExcludeItemTemplate = {
			...common,
			excludeWidget
		};

		this.addSettingElementFocusHandler(template);

		common.toDispose.push(excludeWidget.onDidChangeList(e => this.onDidChangeExclude(template, e)));

		return template;
	}

	private onDidChangeExclude(template: ISettingExcludeItemTemplate, e: IListChangeEvent): void {
		if (template.context) {
			const newValue = { ...template.context.scopeValue };

			// first delete the existing entry, if present
			if (e.originalValue) {
				if (e.originalValue in template.context.defaultValue) {
					// delete a default by overriding it
					newValue[e.originalValue] = false;
				} else {
					delete newValue[e.originalValue];
				}
			}

			// then add the new or updated entry, if present
			if (e.value) {
				if (e.value in template.context.defaultValue && !e.sibling) {
					// add a default by deleting its override
					delete newValue[e.value];
				} else {
					newValue[e.value] = e.sibling ? { when: e.sibling } : true;
				}
			}

			function sortKeys<T extends object>(obj: T) {
				const sortedKeys = Object.keys(obj)
					.sort((a, b) => a.localeCompare(b)) as Array<keyof T>;

				const retVal: Partial<T> = {};
				for (const key of sortedKeys) {
					retVal[key] = obj[key];
				}
				return retVal;
			}

			this._onDidChangeSetting.fire({
				key: template.context.setting.key,
				value: Object.keys(newValue).length === 0 ? undefined : sortKeys(newValue),
				type: template.context.valueType
			});
		}
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingExcludeItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingExcludeItemTemplate, onChange: (value: string) => void): void {
		const value = getExcludeDisplayValue(dataElement);
		template.excludeWidget.setValue(value);
		template.context = dataElement;
	}
}

export class SettingTextRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingTextItemTemplate> {
	templateId = SETTINGS_TEXT_TEMPLATE_ID;

	renderTemplate(_container: HTMLElement): ISettingTextItemTemplate {
		const common = this.renderCommonTemplate(null, _container, 'text');
		const validationErrorMessageElement = DOM.append(common.containerElement, $('.setting-item-validation-message'));

		const inputBox = new InputBox(common.controlElement, this._contextViewService);
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this._themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		common.toDispose.push(
			inputBox.onDidChange(e => {
				if (template.onChange) {
					template.onChange(e);
				}
			}));
		common.toDispose.push(inputBox);
		inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);

		const template: ISettingTextItemTemplate = {
			...common,
			inputBox,
			validationErrorMessageElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingTextItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, onChange: (value: string) => void): void {
		const label = this.setElementAriaLabels(dataElement, SETTINGS_TEXT_TEMPLATE_ID, template);

		template.onChange = undefined;
		template.inputBox.value = dataElement.value;
		template.onChange = value => { renderValidations(dataElement, template, false, label); onChange(value); };

		renderValidations(dataElement, template, true, label);
	}
}

export class SettingEnumRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingEnumItemTemplate> {
	templateId = SETTINGS_ENUM_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISettingEnumItemTemplate {
		const common = this.renderCommonTemplate(null, container, 'enum');

		const selectBox = new SelectBox([], 0, this._contextViewService, undefined, { useCustomDrawn: true });

		common.toDispose.push(selectBox);
		common.toDispose.push(attachSelectBoxStyler(selectBox, this._themeService, {
			selectBackground: settingsSelectBackground,
			selectForeground: settingsSelectForeground,
			selectBorder: settingsSelectBorder,
			selectListBorder: settingsSelectListBorder
		}));
		selectBox.render(common.controlElement);
		const selectElement = common.controlElement.querySelector('select');
		if (selectElement) {
			selectElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
		}

		common.toDispose.push(
			selectBox.onDidSelect(e => {
				if (template.onChange) {
					template.onChange(e.index);
				}
			}));

		const enumDescriptionElement = common.containerElement.insertBefore($('.setting-item-enumDescription'), common.descriptionElement.nextSibling);

		const template: ISettingEnumItemTemplate = {
			...common,
			selectBox,
			enumDescriptionElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingEnumItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingEnumItemTemplate, onChange: (value: string) => void): void {
		const enumDescriptions = dataElement.setting.enumDescriptions;
		const enumDescriptionsAreMarkdown = dataElement.setting.enumDescriptionsAreMarkdown;

		const displayOptions = dataElement.setting.enum!
			.map(String)
			.map(escapeInvisibleChars)
			.map((data, index) => <ISelectOptionItem>{
				text: data,
				description: (enumDescriptions && enumDescriptions[index] && (enumDescriptionsAreMarkdown ? fixSettingLinks(enumDescriptions[index], false) : enumDescriptions[index])),
				descriptionIsMarkdown: enumDescriptionsAreMarkdown,
				decoratorRight: (data === dataElement.defaultValue ? localize('settings.Default', "{0}", 'default') : '')
			});

		template.selectBox.setOptions(displayOptions);

		const label = this.setElementAriaLabels(dataElement, SETTINGS_ENUM_TEMPLATE_ID, template);
		template.selectBox.setAriaLabel(label);

		let idx = dataElement.setting.enum!.indexOf(dataElement.value);
		if (idx === -1) {
			idx = dataElement.setting.enum!.indexOf(dataElement.defaultValue);
			if (idx === -1) {
				idx = 0;
			}
		}

		template.onChange = undefined;
		template.selectBox.select(idx);
		template.onChange = idx => onChange(dataElement.setting.enum![idx]);

		template.enumDescriptionElement.innerHTML = '';
	}
}

export class SettingNumberRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingNumberItemTemplate> {
	templateId = SETTINGS_NUMBER_TEMPLATE_ID;

	renderTemplate(_container: HTMLElement): ISettingNumberItemTemplate {
		const common = super.renderCommonTemplate(null, _container, 'number');
		const validationErrorMessageElement = DOM.append(common.containerElement, $('.setting-item-validation-message'));

		const inputBox = new InputBox(common.controlElement, this._contextViewService, { type: 'number' });
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this._themeService, {
			inputBackground: settingsNumberInputBackground,
			inputForeground: settingsNumberInputForeground,
			inputBorder: settingsNumberInputBorder
		}));
		common.toDispose.push(
			inputBox.onDidChange(e => {
				if (template.onChange) {
					template.onChange(e);
				}
			}));
		common.toDispose.push(inputBox);
		inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);

		const template: ISettingNumberItemTemplate = {
			...common,
			inputBox,
			validationErrorMessageElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingNumberItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingNumberItemTemplate, onChange: (value: number | null) => void): void {
		const numParseFn = (dataElement.valueType === 'integer' || dataElement.valueType === 'nullable-integer')
			? parseInt : parseFloat;

		const nullNumParseFn = (dataElement.valueType === 'nullable-integer' || dataElement.valueType === 'nullable-number')
			? ((v: string) => v === '' ? null : numParseFn(v)) : numParseFn;

		const label = this.setElementAriaLabels(dataElement, SETTINGS_NUMBER_TEMPLATE_ID, template);

		template.onChange = undefined;
		template.inputBox.value = dataElement.value;
		template.onChange = value => {
			renderValidations(dataElement, template, false, label);
			onChange(nullNumParseFn(value));
		};

		renderValidations(dataElement, template, true, label);
	}
}

export class SettingBoolRenderer extends AbstractSettingRenderer implements ITreeRenderer<SettingsTreeSettingElement, never, ISettingBoolItemTemplate> {
	templateId = SETTINGS_BOOL_TEMPLATE_ID;

	renderTemplate(_container: HTMLElement): ISettingBoolItemTemplate {
		DOM.addClass(_container, 'setting-item');
		DOM.addClass(_container, 'setting-item-bool');

		const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));

		const titleElement = DOM.append(container, $('.setting-item-title'));
		const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));

		const descriptionAndValueElement = DOM.append(container, $('.setting-item-value-description'));
		const controlElement = DOM.append(descriptionAndValueElement, $('.setting-item-bool-control'));
		const descriptionElement = DOM.append(descriptionAndValueElement, $('.setting-item-description'));
		const modifiedIndicatorElement = DOM.append(container, $('.setting-item-modified-indicator'));
		modifiedIndicatorElement.title = localize('modified', "Modified");


		const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));

		const toDispose = new DisposableStore();
		const checkbox = new Checkbox({ actionClassName: 'setting-value-checkbox', isChecked: true, title: '', inputActiveOptionBorder: undefined });
		controlElement.appendChild(checkbox.domNode);
		toDispose.add(checkbox);
		toDispose.add(checkbox.onChange(() => {
			if (template.onChange) {
				template.onChange(checkbox.checked);
			}
		}));

		// Need to listen for mouse clicks on description and toggle checkbox - use target ID for safety
		// Also have to ignore embedded links - too buried to stop propagation
		toDispose.add(DOM.addDisposableListener(descriptionElement, DOM.EventType.MOUSE_DOWN, (e) => {
			const targetElement = <HTMLElement>e.target;
			const targetId = descriptionElement.getAttribute('checkbox_label_target_id');

			// Make sure we are not a link and the target ID matches
			// Toggle target checkbox
			if (targetElement.tagName.toLowerCase() !== 'a' && targetId === template.checkbox.domNode.id) {
				template.checkbox.checked = template.checkbox.checked ? false : true;
				template.onChange!(checkbox.checked);
			}
			DOM.EventHelper.stop(e);
		}));


		checkbox.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
		const toolbarContainer = DOM.append(container, $('.setting-toolbar-container'));
		const toolbar = this.renderSettingToolbar(toolbarContainer);
		toDispose.add(toolbar);

		const template: ISettingBoolItemTemplate = {
			toDispose: [toDispose],

			containerElement: container,
			categoryElement,
			labelElement,
			controlElement,
			checkbox,
			descriptionElement,
			deprecationWarningElement,
			otherOverridesElement,
			toolbar
		};

		this.addSettingElementFocusHandler(template);

		// Prevent clicks from being handled by list
		toDispose.add(DOM.addDisposableListener(controlElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.add(DOM.addStandardDisposableListener(controlElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				e.browserEvent.stopPropagation();
			}
		}));

		toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, e => container.classList.add('mouseover')));
		toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, e => container.classList.remove('mouseover')));

		return template;
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: ISettingBoolItemTemplate): void {
		super.renderSettingElement(element, index, templateData);
	}

	protected renderValue(dataElement: SettingsTreeSettingElement, template: ISettingBoolItemTemplate, onChange: (value: boolean) => void): void {
		template.onChange = undefined;
		template.checkbox.checked = dataElement.value;
		template.onChange = onChange;

		// Setup and add ARIA attributes
		this.setElementAriaLabels(dataElement, SETTINGS_BOOL_TEMPLATE_ID, template);
	}
}

export class SettingTreeRenderers {
	readonly onDidClickOverrideElement: Event<ISettingOverrideClickEvent>;

	private readonly _onDidChangeSetting = new Emitter<ISettingChangeEvent>();
	readonly onDidChangeSetting: Event<ISettingChangeEvent>;

	readonly onDidOpenSettings: Event<string>;

	readonly onDidClickSettingLink: Event<ISettingLinkClickEvent>;

	readonly onDidFocusSetting: Event<SettingsTreeSettingElement>;

	readonly allRenderers: ITreeRenderer<SettingsTreeElement, never, any>[];

	private readonly settingActions: IAction[];

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
		this.settingActions = [
			new Action('settings.resetSetting', localize('resetSettingLabel', "Reset Setting"), undefined, undefined, (context: SettingsTreeSettingElement) => {
				if (context) {
					this._onDidChangeSetting.fire({ key: context.setting.key, value: undefined, type: context.setting.type as SettingValueType });
				}

				return Promise.resolve(null);
			}),
			new Separator(),
			this._instantiationService.createInstance(CopySettingIdAction),
			this._instantiationService.createInstance(CopySettingAsJSONAction),
		];

		const settingRenderers = [
			this._instantiationService.createInstance(SettingBoolRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingNumberRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingBoolRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingArrayRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingComplexRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingTextRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingExcludeRenderer, this.settingActions),
			this._instantiationService.createInstance(SettingEnumRenderer, this.settingActions),
		];

		this.onDidClickOverrideElement = Event.any(...settingRenderers.map(r => r.onDidClickOverrideElement));
		this.onDidChangeSetting = Event.any(
			...settingRenderers.map(r => r.onDidChangeSetting),
			this._onDidChangeSetting.event
		);
		this.onDidOpenSettings = Event.any(...settingRenderers.map(r => r.onDidOpenSettings));
		this.onDidClickSettingLink = Event.any(...settingRenderers.map(r => r.onDidClickSettingLink));
		this.onDidFocusSetting = Event.any(...settingRenderers.map(r => r.onDidFocusSetting));

		this.allRenderers = [
			...settingRenderers,
			this._instantiationService.createInstance(SettingGroupRenderer),
			this._instantiationService.createInstance(SettingNewExtensionsRenderer),
		];
	}

	cancelSuggesters() {
		this._contextViewService.hideContextView();
	}

	showContextMenu(element: SettingsTreeSettingElement, settingDOMElement: HTMLElement): void {
		const toolbarElement = settingDOMElement.querySelector('.toolbar-toggle-more');
		if (toolbarElement) {
			this._contextMenuService.showContextMenu({
				getActions: () => this.settingActions,
				getAnchor: () => <HTMLElement>toolbarElement,
				getActionsContext: () => element
			});
		}
	}

	getSettingDOMElementForDOMElement(domElement: HTMLElement): HTMLElement | null {
		const parent = DOM.findParentWithClass(domElement, AbstractSettingRenderer.CONTENTS_CLASS);
		if (parent) {
			return parent;
		}

		return null;
	}

	getDOMElementsForSettingKey(treeContainer: HTMLElement, key: string): NodeListOf<HTMLElement> {
		return treeContainer.querySelectorAll(`[${AbstractSettingRenderer.SETTING_KEY_ATTR}="${key}"]`);
	}

	getKeyForDOMElementInSetting(element: HTMLElement): string | null {
		const settingElement = this.getSettingDOMElementForDOMElement(element);
		return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
	}

	getIdForDOMElementInSetting(element: HTMLElement): string | null {
		const settingElement = this.getSettingDOMElementForDOMElement(element);
		return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_ID_ATTR);
	}
}

function renderValidations(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, calledOnStartup: boolean, originalAriaLabel: string) {
	if (dataElement.setting.validator) {
		const errMsg = dataElement.setting.validator(template.inputBox.value);
		if (errMsg) {
			DOM.addClass(template.containerElement, 'invalid-input');
			template.validationErrorMessageElement.innerText = errMsg;
			const validationError = localize('validationError', "Validation Error.");
			template.inputBox.inputElement.parentElement!.setAttribute('aria-label', [originalAriaLabel, validationError, errMsg].join(' '));
			if (!calledOnStartup) { ariaAlert(validationError + ' ' + errMsg); }
			return;
		} else {
			template.inputBox.inputElement.parentElement!.setAttribute('aria-label', originalAriaLabel);
		}
	}
	DOM.removeClass(template.containerElement, 'invalid-input');
}

function cleanRenderedMarkdown(element: Node): void {
	for (let i = 0; i < element.childNodes.length; i++) {
		const child = element.childNodes.item(i);

		const tagName = (<Element>child).tagName && (<Element>child).tagName.toLowerCase();
		if (tagName === 'img') {
			element.removeChild(child);
		} else {
			cleanRenderedMarkdown(child);
		}
	}
}

function fixSettingLinks(text: string, linkify = true): string {
	return text.replace(/`#([^#]*)#`/g, (match, settingKey) => {
		const targetDisplayFormat = settingKeyToDisplayFormat(settingKey);
		const targetName = `${targetDisplayFormat.category}: ${targetDisplayFormat.label}`;
		return linkify ?
			`[${targetName}](#${settingKey})` :
			`"${targetName}"`;
	});
}

function escapeInvisibleChars(enumValue: string): string {
	return enumValue && enumValue
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

export class SettingsTreeFilter implements ITreeFilter<SettingsTreeElement> {
	constructor(
		private viewState: ISettingsEditorViewState,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
	) { }

	filter(element: SettingsTreeElement, parentVisibility: TreeVisibility): TreeFilterResult<void> {
		// Filter during search
		if (this.viewState.filterToCategory && element instanceof SettingsTreeSettingElement) {
			if (!this.settingContainedInGroup(element.setting, this.viewState.filterToCategory)) {
				return false;
			}
		}

		// Non-user scope selected
		if (element instanceof SettingsTreeSettingElement && this.viewState.settingsTarget !== ConfigurationTarget.USER_LOCAL) {
			const isRemote = !!this.environmentService.configuration.remoteAuthority;
			if (!element.matchesScope(this.viewState.settingsTarget, isRemote)) {
				return false;
			}
		}

		// @modified or tag
		if (element instanceof SettingsTreeSettingElement && this.viewState.tagFilters) {
			if (!element.matchesAllTags(this.viewState.tagFilters)) {
				return false;
			}
		}

		// Group with no visible children
		if (element instanceof SettingsTreeGroupElement) {
			if (typeof element.count === 'number') {
				return element.count > 0;
			}

			return TreeVisibility.Recurse;
		}

		// Filtered "new extensions" button
		if (element instanceof SettingsTreeNewExtensionsElement) {
			if ((this.viewState.tagFilters && this.viewState.tagFilters.size) || this.viewState.filterToCategory) {
				return false;
			}
		}

		return true;
	}

	private settingContainedInGroup(setting: ISetting, group: SettingsTreeGroupElement): boolean {
		return group.children.some(child => {
			if (child instanceof SettingsTreeGroupElement) {
				return this.settingContainedInGroup(setting, child);
			} else if (child instanceof SettingsTreeSettingElement) {
				return child.setting.key === setting.key;
			} else {
				return false;
			}
		});
	}
}

class SettingsTreeDelegate implements IListVirtualDelegate<SettingsTreeGroupChild> {

	private heightCache = new WeakMap<SettingsTreeGroupChild, number>();

	getHeight(element: SettingsTreeGroupChild): number {
		const cachedHeight = this.heightCache.get(element);

		if (typeof cachedHeight === 'number') {
			return cachedHeight;
		}

		if (element instanceof SettingsTreeGroupElement) {
			if (element.isFirstGroup) {
				return 31;
			}

			return 40 + (7 * element.level);
		}

		return element instanceof SettingsTreeSettingElement && element.valueType === SettingValueType.Boolean ?
			78 :
			104;
	}

	getTemplateId(element: SettingsTreeGroupElement | SettingsTreeSettingElement | SettingsTreeNewExtensionsElement): string {
		if (element instanceof SettingsTreeGroupElement) {
			return SETTINGS_ELEMENT_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (element.valueType === SettingValueType.Boolean) {
				return SETTINGS_BOOL_TEMPLATE_ID;
			}

			if (element.valueType === SettingValueType.Integer || element.valueType === SettingValueType.Number || element.valueType === SettingValueType.NullableInteger || element.valueType === SettingValueType.NullableNumber) {
				return SETTINGS_NUMBER_TEMPLATE_ID;
			}

			if (element.valueType === SettingValueType.String) {
				return SETTINGS_TEXT_TEMPLATE_ID;
			}

			if (element.valueType === SettingValueType.Enum) {
				return SETTINGS_ENUM_TEMPLATE_ID;
			}

			if (element.valueType === SettingValueType.ArrayOfString) {
				return SETTINGS_ARRAY_TEMPLATE_ID;
			}

			if (element.valueType === SettingValueType.Exclude) {
				return SETTINGS_EXCLUDE_TEMPLATE_ID;
			}

			return SETTINGS_COMPLEX_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeNewExtensionsElement) {
			return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
		}

		throw new Error('unknown element type: ' + element);
	}

	hasDynamicHeight(element: SettingsTreeGroupElement | SettingsTreeSettingElement | SettingsTreeNewExtensionsElement): boolean {
		return !(element instanceof SettingsTreeGroupElement);
	}

	setDynamicHeight(element: SettingsTreeGroupChild, height: number): void {
		this.heightCache.set(element, height);
	}
}

class NonCollapsibleObjectTreeModel<T> extends ObjectTreeModel<T> {
	isCollapsible(element: T): boolean {
		return false;
	}

	setCollapsed(element: T, collapsed?: boolean, recursive?: boolean): boolean {
		return false;
	}
}

export class SettingsTree extends ObjectTree<SettingsTreeElement> {
	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		renderers: ITreeRenderer<any, void, any>[],
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const treeClass = 'settings-editor-tree';

		super(container,
			new SettingsTreeDelegate(),
			renderers,
			{
				supportDynamicHeights: true,
				ariaRole: ListAriaRootRole.FORM,
				ariaLabel: localize('treeAriaLabel', "Settings"),
				identityProvider: {
					getId(e) {
						return e.id;
					}
				},
				styleController: new DefaultStyleController(DOM.createStyleSheet(container), treeClass),
				filter: instantiationService.createInstance(SettingsTreeFilter, viewState)
			});

		this.disposables = [];
		this.disposables.push(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-list:focus .monaco-list-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.9));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description { color: ${fgWithOpacity}; }`);
			}

			const errorColor = theme.getColor(errorForeground);
			if (errorColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-deprecation-message { color: ${errorColor}; }`);
			}

			const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
			if (invalidInputBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
			}

			const invalidInputForeground = theme.getColor(inputValidationErrorForeground);
			if (invalidInputForeground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { color: ${invalidInputForeground}; }`);
			}

			const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
			if (invalidInputBorder) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
			}

			const headerForegroundColor = theme.getColor(settingsHeaderForeground);
			if (headerForegroundColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .settings-group-title-label { color: ${headerForegroundColor}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-label { color: ${headerForegroundColor}; }`);
			}

			const focusBorderColor = theme.getColor(focusBorder);
			if (focusBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a:focus { outline-color: ${focusBorderColor} }`);
			}
		}));

		this.getHTMLElement().classList.add(treeClass);

		this.disposables.push(attachStyler(themeService, {
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: foreground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: foreground,
			listFocusBackground: editorBackground,
			listFocusForeground: foreground,
			listHoverForeground: foreground,
			listHoverBackground: editorBackground,
			listHoverOutline: editorBackground,
			listFocusOutline: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: foreground,
			listInactiveFocusBackground: editorBackground,
			listInactiveFocusOutline: editorBackground
		}, colors => {
			this.style(colors);
		}));
	}

	protected createModel(view: ISpliceable<ITreeNode<SettingsTreeGroupChild>>, options: IObjectTreeOptions<SettingsTreeGroupChild>): ITreeModel<SettingsTreeGroupChild | null, void, SettingsTreeGroupChild | null> {
		return new NonCollapsibleObjectTreeModel<SettingsTreeGroupChild>(view, options);
	}
}

class CopySettingIdAction extends Action {
	static readonly ID = 'settings.copySettingId';
	static readonly LABEL = localize('copySettingIdLabel', "Copy Setting ID");

	constructor(
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(CopySettingIdAction.ID, CopySettingIdAction.LABEL);
	}

	async run(context: SettingsTreeSettingElement): Promise<void> {
		if (context) {
			await this.clipboardService.writeText(context.setting.key);
		}

		return Promise.resolve(undefined);
	}
}

class CopySettingAsJSONAction extends Action {
	static readonly ID = 'settings.copySettingAsJSON';
	static readonly LABEL = localize('copySettingAsJSONLabel', "Copy Setting as JSON");

	constructor(
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(CopySettingAsJSONAction.ID, CopySettingAsJSONAction.LABEL);
	}

	async run(context: SettingsTreeSettingElement): Promise<void> {
		if (context) {
			const jsonResult = `"${context.setting.key}": ${JSON.stringify(context.value, undefined, '  ')}`;
			await this.clipboardService.writeText(jsonResult);
		}

		return Promise.resolve(undefined);
	}
}
