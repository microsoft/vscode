/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { alert as ariaAlert } from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters, startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAccessibilityProvider, IDataSource, IFilter, IRenderer as ITreeRenderer, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import { DefaultTreestyler } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorBackground, errorForeground, focusBorder, foreground, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ISettingsEditorViewState, isExcludeSetting, settingKeyToDisplayFormat, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { ExcludeSettingWidget, IExcludeDataItem, settingsHeaderForeground, settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU } from 'vs/workbench/parts/preferences/common/preferences';
import { ISetting, ISettingsGroup, SettingValueType } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

function getExcludeDisplayValue(element: SettingsTreeSettingElement): IExcludeDataItem[] {
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
				pattern: key,
				sibling
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
	let children: ITOCEntry[];
	if (tocData.children) {
		children = tocData.children
			.map(child => _resolveSettingsTree(child, allSettings))
			.filter(child => (child.children && child.children.length) || (child.settings && child.settings.length));
	}

	let settings: ISetting[];
	if (tocData.settings) {
		settings = arrays.flatten(tocData.settings.map(pattern => getMatchingSettings(allSettings, <string>pattern)));
	}

	if (!children && !settings) {
		return null;
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


export class SettingsDataSource implements IDataSource {

	getId(tree: ITree, element: SettingsTreeElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: SettingsTreeElement): boolean {
		if (element instanceof SettingsTreeGroupElement) {
			return true;
		}

		return false;
	}

	getChildren(tree: ITree, element: SettingsTreeElement): TPromise<any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: SettingsTreeElement): SettingsTreeElement[] {
		if (element instanceof SettingsTreeGroupElement) {
			return element.children;
		} else {
			// No children...
			return null;
		}
	}

	getParent(tree: ITree, element: SettingsTreeElement): TPromise<any> {
		return TPromise.wrap(element && element.parent);
	}

	shouldAutoexpand(): boolean {
		return true;
	}
}

export class SimplePagedDataSource implements IDataSource {
	private static readonly SETTINGS_PER_PAGE = 30;
	private static readonly BUFFER = 5;

	private loadedToIndex: number;

	constructor(private realDataSource: IDataSource) {
		this.reset();
	}

	reset(): void {
		this.loadedToIndex = SimplePagedDataSource.SETTINGS_PER_PAGE;
	}

	pageTo(index: number, top = false): boolean {
		const buffer = top ? SimplePagedDataSource.SETTINGS_PER_PAGE : SimplePagedDataSource.BUFFER;

		if (index > this.loadedToIndex - buffer) {
			this.loadedToIndex = (Math.ceil(index / SimplePagedDataSource.SETTINGS_PER_PAGE) + 1) * SimplePagedDataSource.SETTINGS_PER_PAGE;
			return true;
		} else {
			return false;
		}
	}

	getId(tree: ITree, element: any): string {
		return this.realDataSource.getId(tree, element);
	}

	hasChildren(tree: ITree, element: any): boolean {
		return this.realDataSource.hasChildren(tree, element);
	}

	getChildren(tree: ITree, element: SettingsTreeGroupElement): TPromise<any> {
		return this.realDataSource.getChildren(tree, element).then(realChildren => {
			return this._getChildren(realChildren);
		});
	}

	_getChildren(realChildren: SettingsTreeElement[]): any[] {
		const lastChild = realChildren[realChildren.length - 1];
		if (lastChild && lastChild.index > this.loadedToIndex) {
			return realChildren.filter(child => {
				return child.index < this.loadedToIndex;
			});
		} else {
			return realChildren;
		}
	}

	getParent(tree: ITree, element: any): TPromise<any> {
		return this.realDataSource.getParent(tree, element);
	}

	shouldAutoexpand(tree: ITree, element: any): boolean {
		return this.realDataSource.shouldAutoexpand(tree, element);
	}
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

interface ISettingExcludeItemTemplate extends ISettingItemTemplate<void> {
	excludeWidget: ExcludeSettingWidget;
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
const SETTINGS_EXCLUDE_TEMPLATE_ID = 'settings.exclude.template';
const SETTINGS_COMPLEX_TEMPLATE_ID = 'settings.complex.template';
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = 'settings.newExtensions.template';
const SETTINGS_GROUP_ELEMENT_TEMPLATE_ID = 'settings.group.template';

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

export class SettingsRenderer implements ITreeRenderer {

	public static readonly CONTROL_CLASS = 'setting-control-focus-target';
	public static readonly CONTROL_SELECTOR = '.' + SettingsRenderer.CONTROL_CLASS;

	public static readonly SETTING_KEY_ATTR = 'data-key';

	private readonly _onDidClickOverrideElement: Emitter<ISettingOverrideClickEvent> = new Emitter<ISettingOverrideClickEvent>();
	public readonly onDidClickOverrideElement: Event<ISettingOverrideClickEvent> = this._onDidClickOverrideElement.event;

	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	private readonly _onDidOpenSettings: Emitter<string> = new Emitter<string>();
	public readonly onDidOpenSettings: Event<string> = this._onDidOpenSettings.event;

	private readonly _onDidClickSettingLink: Emitter<ISettingLinkClickEvent> = new Emitter<ISettingLinkClickEvent>();
	public readonly onDidClickSettingLink: Event<ISettingLinkClickEvent> = this._onDidClickSettingLink.event;

	private readonly _onDidFocusSetting: Emitter<SettingsTreeSettingElement> = new Emitter<SettingsTreeSettingElement>();
	public readonly onDidFocusSetting: Event<SettingsTreeSettingElement> = this._onDidFocusSetting.event;

	private descriptionMeasureContainer: HTMLElement;
	private longestSingleLineDescription = 0;

	private rowHeightCache = new Map<string, number>();
	private lastRenderedWidth: number;

	private settingActions: IAction[];

	constructor(
		_measureParent: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IContextViewService private contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
	) {
		this.descriptionMeasureContainer = $('.setting-item-description');
		DOM.append(_measureParent,
			$('.setting-measure-container.monaco-tree.settings-editor-tree', undefined,
				$('.monaco-scrollable-element', undefined,
					$('.monaco-tree-wrapper', undefined,
						$('.monaco-tree-rows', undefined,
							$('.monaco-tree-row', undefined,
								$('.setting-item', undefined,
									this.descriptionMeasureContainer)))))));

		this.settingActions = [
			new Action('settings.resetSetting', localize('resetSettingLabel', "Reset Setting"), undefined, undefined, (context: SettingsTreeSettingElement) => {
				if (context) {
					this._onDidChangeSetting.fire({ key: context.setting.key, value: undefined, type: context.setting.type as SettingValueType });
				}

				return TPromise.wrap(null);
			}),
			new Separator(),
			this.instantiationService.createInstance(CopySettingIdAction),
			this.instantiationService.createInstance(CopySettingAsJSONAction),
		];

	}

	showContextMenu(element: SettingsTreeSettingElement, settingDOMElement: HTMLElement): void {
		const toolbarElement: HTMLElement = settingDOMElement.querySelector('.toolbar-toggle-more');
		if (toolbarElement) {
			this.contextMenuService.showContextMenu({
				getActions: () => TPromise.wrap(this.settingActions),
				getAnchor: () => toolbarElement,
				getActionsContext: () => element
			});
		}
	}

	updateWidth(width: number): void {
		if (this.lastRenderedWidth !== width) {
			this.rowHeightCache = new Map<string, number>();
		}
		this.longestSingleLineDescription = 0;

		this.lastRenderedWidth = width;
	}

	getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (this.rowHeightCache.has(element.id) && !(element instanceof SettingsTreeSettingElement && isExcludeSetting(element.setting))) {
			return this.rowHeightCache.get(element.id);
		}

		const h = this._getHeight(tree, element);
		this.rowHeightCache.set(element.id, h);
		return h;
	}

	_getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (element instanceof SettingsTreeGroupElement) {
			if (element.isFirstGroup) {
				return 31;
			}

			return 40 + (7 * element.level);
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (isExcludeSetting(element.setting)) {
				return this._getExcludeSettingHeight(element);
			} else {
				return this.measureSettingElementHeight(tree, element);
			}
		}

		if (element instanceof SettingsTreeNewExtensionsElement) {
			return 40;
		}

		return 0;
	}

	_getExcludeSettingHeight(element: SettingsTreeSettingElement): number {
		const displayValue = getExcludeDisplayValue(element);
		return (displayValue.length + 1) * 22 + 66 + this.measureSettingDescription(element);
	}

	private measureSettingElementHeight(tree: ITree, element: SettingsTreeSettingElement): number {
		let heightExcludingDescription = 86;

		if (element.valueType === 'boolean') {
			heightExcludingDescription = 60;
		}

		return heightExcludingDescription + this.measureSettingDescription(element);
	}

	private measureSettingDescription(element: SettingsTreeSettingElement): number {
		if (element.description.length < this.longestSingleLineDescription * .8) {
			// Most setting descriptions are one short line, so try to avoid measuring them.
			// If the description is less than 80% of the longest single line description, assume this will also render to be one line.
			return 18;
		}

		const boolMeasureClass = 'measure-bool-description';
		if (element.valueType === 'boolean') {
			this.descriptionMeasureContainer.classList.add(boolMeasureClass);
		} else if (this.descriptionMeasureContainer.classList.contains(boolMeasureClass)) {
			this.descriptionMeasureContainer.classList.remove(boolMeasureClass);
		}

		const shouldRenderMarkdown = element.setting.descriptionIsMarkdown && element.description.indexOf('\n- ') >= 0;

		while (this.descriptionMeasureContainer.firstChild) {
			this.descriptionMeasureContainer.removeChild(this.descriptionMeasureContainer.firstChild);
		}

		if (shouldRenderMarkdown) {
			const text = fixSettingLinks(element.description);
			const rendered = renderMarkdown({ value: text });
			rendered.classList.add('setting-item-description-markdown');
			this.descriptionMeasureContainer.appendChild(rendered);

			return this.descriptionMeasureContainer.offsetHeight;
		} else {
			// Remove markdown links, setting links, backticks
			const measureText = element.setting.descriptionIsMarkdown ?
				fixSettingLinks(element.description)
					.replace(/\[(.*)\]\(.*\)/g, '$1')
					.replace(/`([^`]*)`/g, '$1') :
				element.description;

			this.descriptionMeasureContainer.innerText = measureText;
			const h = this.descriptionMeasureContainer.offsetHeight;
			if (h < 20 && measureText.length > this.longestSingleLineDescription) {
				this.longestSingleLineDescription = measureText.length;
			}

			return h;
		}
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {
		if (element instanceof SettingsTreeGroupElement) {
			return SETTINGS_GROUP_ELEMENT_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (element.valueType === 'boolean') {
				return SETTINGS_BOOL_TEMPLATE_ID;
			}

			if (element.valueType === 'integer' || element.valueType === 'number' || element.valueType === 'nullable-integer' || element.valueType === 'nullable-number') {
				return SETTINGS_NUMBER_TEMPLATE_ID;
			}

			if (element.valueType === 'string') {
				return SETTINGS_TEXT_TEMPLATE_ID;
			}

			if (element.valueType === 'enum') {
				return SETTINGS_ENUM_TEMPLATE_ID;
			}

			if (element.valueType === 'exclude') {
				return SETTINGS_EXCLUDE_TEMPLATE_ID;
			}

			return SETTINGS_COMPLEX_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeNewExtensionsElement) {
			return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
		}

		return '';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupTitleTemplate(container);
		}

		if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			return this.renderSettingTextTemplate(tree, container);
		}

		if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			return this.renderSettingNumberTemplate(tree, container);
		}

		if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			return this.renderSettingBoolTemplate(tree, container);
		}

		if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			return this.renderSettingEnumTemplate(tree, container);
		}

		if (templateId === SETTINGS_EXCLUDE_TEMPLATE_ID) {
			return this.renderSettingExcludeTemplate(tree, container);
		}

		if (templateId === SETTINGS_COMPLEX_TEMPLATE_ID) {
			return this.renderSettingComplexTemplate(tree, container);
		}

		if (templateId === SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID) {
			return this.renderNewExtensionsTemplate(container);
		}

		return null;
	}

	private renderGroupTitleTemplate(container: HTMLElement): IGroupTitleTemplate {
		DOM.addClass(container, 'group-title');

		const toDispose: IDisposable[] = [];
		const template: IGroupTitleTemplate = {
			parent: container,
			toDispose
		};

		return template;
	}

	private renderCommonTemplate(tree: ITree, container: HTMLElement, typeClass: string): ISettingItemTemplate {
		DOM.addClass(container, 'setting-item');
		DOM.addClass(container, 'setting-item-' + typeClass);
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
		toDispose.push(DOM.addDisposableListener(controlElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.push(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, (e: IMouseEvent) => container.classList.add('mouseover')));
		toDispose.push(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, (e: IMouseEvent) => container.classList.remove('mouseover')));

		toDispose.push(DOM.addStandardDisposableListener(valueElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				tree.domFocus();
				e.browserEvent.stopPropagation();
			}
		}));

		return template;
	}

	private addSettingElementFocusHandler(template: ISettingItemTemplate): void {
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

	private renderSettingTextTemplate(tree: ITree, container: HTMLElement, type = 'text'): ISettingTextItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'text');
		const validationErrorMessageElement = DOM.append(container, $('.setting-item-validation-message'));

		const inputBox = new InputBox(common.controlElement, this.contextViewService);
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
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
		inputBox.inputElement.classList.add(SettingsRenderer.CONTROL_CLASS);

		const template: ISettingTextItemTemplate = {
			...common,
			inputBox,
			validationErrorMessageElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingNumberTemplate(tree: ITree, container: HTMLElement): ISettingNumberItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'number');
		const validationErrorMessageElement = DOM.append(container, $('.setting-item-validation-message'));

		const inputBox = new InputBox(common.controlElement, this.contextViewService, { type: 'number' });
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
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
		inputBox.inputElement.classList.add(SettingsRenderer.CONTROL_CLASS);

		const template: ISettingNumberItemTemplate = {
			...common,
			inputBox,
			validationErrorMessageElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingToolbar(container: HTMLElement): ToolBar {
		const toggleMenuKeybinding = this.keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU);
		let toggleMenuTitle = localize('settingsContextMenuTitle', "More Actions... ");
		if (toggleMenuKeybinding) {
			toggleMenuTitle += ` (${toggleMenuKeybinding && toggleMenuKeybinding.getLabel()})`;
		}

		const toolbar = new ToolBar(container, this.contextMenuService, {
			toggleMenuTitle
		});
		toolbar.setActions([], this.settingActions)();
		const button = container.querySelector('.toolbar-toggle-more');
		if (button) {
			(<HTMLElement>button).tabIndex = -1;
		}

		return toolbar;
	}

	private renderSettingBoolTemplate(tree: ITree, container: HTMLElement): ISettingBoolItemTemplate {
		DOM.addClass(container, 'setting-item');
		DOM.addClass(container, 'setting-item-bool');

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

		const toDispose: IDisposable[] = [];
		const checkbox = new Checkbox({ actionClassName: 'setting-value-checkbox', isChecked: true, title: '', inputActiveOptionBorder: null });
		controlElement.appendChild(checkbox.domNode);
		toDispose.push(checkbox);
		toDispose.push(checkbox.onChange(() => {
			if (template.onChange) {
				template.onChange(checkbox.checked);
			}
		}));

		// Need to listen for mouse clicks on description and toggle checkbox - use target ID for safety
		// Also have to ignore embedded links - too buried to stop propagation
		toDispose.push(DOM.addDisposableListener(descriptionElement, DOM.EventType.MOUSE_DOWN, (e) => {
			const targetElement = <HTMLElement>e.toElement;
			const targetId = descriptionElement.getAttribute('checkbox_label_target_id');

			// Make sure we are not a link and the target ID matches
			// Toggle target checkbox
			if (targetElement.tagName.toLowerCase() !== 'a' && targetId === template.checkbox.domNode.id) {
				template.checkbox.checked = template.checkbox.checked ? false : true;
				template.onChange(checkbox.checked);
			}
			DOM.EventHelper.stop(e);
		}));


		checkbox.domNode.classList.add(SettingsRenderer.CONTROL_CLASS);
		const toolbarContainer = DOM.append(container, $('.setting-toolbar-container'));
		const toolbar = this.renderSettingToolbar(toolbarContainer);
		toDispose.push(toolbar);

		const template: ISettingBoolItemTemplate = {
			toDispose,

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
		toDispose.push(DOM.addDisposableListener(controlElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.push(DOM.addStandardDisposableListener(controlElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				tree.domFocus();
				e.browserEvent.stopPropagation();
			}
		}));

		return template;
	}

	public cancelSuggesters() {
		this.contextViewService.hideContextView();
	}

	private renderSettingEnumTemplate(tree: ITree, container: HTMLElement): ISettingEnumItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'enum');

		const selectBox = new SelectBox([], undefined, this.contextViewService, undefined, {
			hasDetails: true
		});

		common.toDispose.push(selectBox);
		common.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService, {
			selectBackground: settingsSelectBackground,
			selectForeground: settingsSelectForeground,
			selectBorder: settingsSelectBorder,
			selectListBorder: settingsSelectListBorder
		}));
		selectBox.render(common.controlElement);
		const selectElement = common.controlElement.querySelector('select');
		if (selectElement) {
			selectElement.classList.add(SettingsRenderer.CONTROL_CLASS);
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

	private renderSettingExcludeTemplate(tree: ITree, container: HTMLElement): ISettingExcludeItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'exclude');

		const excludeWidget = this.instantiationService.createInstance(ExcludeSettingWidget, common.controlElement);
		excludeWidget.domNode.classList.add(SettingsRenderer.CONTROL_CLASS);
		common.toDispose.push(excludeWidget);

		const template: ISettingExcludeItemTemplate = {
			...common,
			excludeWidget
		};

		this.addSettingElementFocusHandler(template);

		common.toDispose.push(excludeWidget.onDidChangeExclude(e => {
			if (template.context) {
				const newValue = { ...template.context.scopeValue };

				// first delete the existing entry, if present
				if (e.originalPattern) {
					if (e.originalPattern in template.context.defaultValue) {
						// delete a default by overriding it
						newValue[e.originalPattern] = false;
					} else {
						delete newValue[e.originalPattern];
					}
				}

				// then add the new or updated entry, if present
				if (e.pattern) {
					if (e.pattern in template.context.defaultValue && !e.sibling) {
						// add a default by deleting its override
						delete newValue[e.pattern];
					} else {
						newValue[e.pattern] = e.sibling ? { when: e.sibling } : true;
					}
				}

				const sortKeys = (obj) => {
					const keyArray = Object.keys(obj)
						.map(key => ({ key, val: obj[key] }))
						.sort((a, b) => a.key.localeCompare(b.key));

					const retVal = {};
					keyArray.forEach(pair => {
						retVal[pair.key] = pair.val;
					});
					return retVal;
				};

				this._onDidChangeSetting.fire({
					key: template.context.setting.key,
					value: Object.keys(newValue).length === 0 ? undefined : sortKeys(newValue),
					type: template.context.valueType
				});
			}
		}));

		return template;
	}

	private renderSettingComplexTemplate(tree: ITree, container: HTMLElement): ISettingComplexItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'complex');

		const openSettingsButton = new Button(common.controlElement, { title: true, buttonBackground: null, buttonHoverBackground: null });
		common.toDispose.push(openSettingsButton);
		common.toDispose.push(openSettingsButton.onDidClick(() => template.onChange(null)));
		openSettingsButton.label = localize('editInSettingsJson', "Edit in settings.json");
		openSettingsButton.element.classList.add('edit-in-settings-button');

		common.toDispose.push(attachButtonStyler(openSettingsButton, this.themeService, {
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

	private renderNewExtensionsTemplate(container: HTMLElement): ISettingNewExtensionsTemplate {
		const toDispose: IDisposable[] = [];

		container.classList.add('setting-item-new-extensions');

		const button = new Button(container, { title: true, buttonBackground: null, buttonHoverBackground: null });
		toDispose.push(button);
		toDispose.push(button.onDidClick(() => {
			if (template.context) {
				this.commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', template.context.extensionIds);
			}
		}));
		button.label = localize('newExtensionsButtonLabel', "Show matching extensions");
		button.element.classList.add('settings-new-extensions-button');
		toDispose.push(attachButtonStyler(button, this.themeService));

		const template: ISettingNewExtensionsTemplate = {
			button,
			toDispose
		};

		// this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(tree: ITree, element: SettingsTreeElement, templateId: string, template: any): void {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupElement(<SettingsTreeGroupElement>element, template);
		}

		if (templateId === SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID) {
			return this.renderNewExtensionsElement(<SettingsTreeNewExtensionsElement>element, template);
		}

		return this.renderSettingElement(tree, <SettingsTreeSettingElement>element, templateId, template);
	}

	private renderGroupElement(element: SettingsTreeGroupElement, template: IGroupTitleTemplate): void {
		template.parent.innerHTML = '';
		const labelElement = DOM.append(template.parent, $('div.settings-group-title-label'));
		labelElement.classList.add(`settings-group-level-${element.level}`);
		labelElement.textContent = (<SettingsTreeGroupElement>element).label;

		if (element.isFirstGroup) {
			labelElement.classList.add('settings-group-first');
		}
	}

	private renderNewExtensionsElement(element: SettingsTreeNewExtensionsElement, template: ISettingNewExtensionsTemplate): void {
		template.context = element;
	}

	public getSettingDOMElementForDOMElement(domElement: HTMLElement): HTMLElement {
		const parent = DOM.findParentWithClass(domElement, 'setting-item');
		if (parent) {
			return parent;
		}

		return null;
	}

	public getDOMElementsForSettingKey(treeContainer: HTMLElement, key: string): NodeListOf<HTMLElement> {
		return treeContainer.querySelectorAll(`[${SettingsRenderer.SETTING_KEY_ATTR}="${key}"]`);
	}

	public getKeyForDOMElementInSetting(element: HTMLElement): string {
		const settingElement = this.getSettingDOMElementForDOMElement(element);
		return settingElement && settingElement.getAttribute(SettingsRenderer.SETTING_KEY_ATTR);
	}

	private renderSettingElement(tree: ITree, element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		template.context = element;
		template.toolbar.context = element;

		const setting = element.setting;

		DOM.toggleClass(template.containerElement, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.containerElement, 'is-expanded', true);
		template.containerElement.setAttribute(SettingsRenderer.SETTING_KEY_ATTR, element.setting.key);

		const titleTooltip = setting.key + (element.isConfigured ? ' - Modified' : '');
		template.categoryElement.textContent = element.displayCategory && (element.displayCategory + ': ');
		template.categoryElement.title = titleTooltip;

		template.labelElement.textContent = element.displayLabel;
		template.labelElement.title = titleTooltip;

		template.descriptionElement.innerHTML = '';
		if (element.setting.descriptionIsMarkdown) {
			const renderedDescription = this.renderDescriptionMarkdown(element, element.description, template.toDispose);
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

			DOM.append(template.otherOverridesElement, $('span', null, `(${otherOverridesLabel}: `));

			for (let i = 0; i < element.overriddenScopeList.length; i++) {
				let view = DOM.append(template.otherOverridesElement, $('a.modified-scope', null, element.overriddenScopeList[i]));

				if (i !== element.overriddenScopeList.length - 1) {
					DOM.append(template.otherOverridesElement, $('span', null, ', '));
				} else {
					DOM.append(template.otherOverridesElement, $('span', null, ')'));
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

		this.renderValue(element, templateId, <ISettingItemTemplate>template);

		// Remove tree attributes - sometimes overridden by tree - should be managed there
		template.containerElement.parentElement.removeAttribute('role');
		template.containerElement.parentElement.removeAttribute('aria-level');
		template.containerElement.parentElement.removeAttribute('aria-posinset');
		template.containerElement.parentElement.removeAttribute('aria-setsize');
	}

	private renderDescriptionMarkdown(element: SettingsTreeSettingElement, text: string, disposeables: IDisposable[]): HTMLElement {
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
						let uri: URI;
						try {
							uri = URI.parse(content);
						} catch (err) {
							// ignore
						}
						if (uri) {
							this.openerService.open(uri).catch(onUnexpectedError);
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

	private renderValue(element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: element.setting.key, value, type: template.context.valueType });
		template.deprecationWarningElement.innerText = element.setting.deprecationMessage || '';

		if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			this.renderEnum(element, <ISettingEnumItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			this.renderText(element, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			this.renderNumber(element, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			this.renderBool(element, <ISettingBoolItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_EXCLUDE_TEMPLATE_ID) {
			this.renderExcludeSetting(element, <ISettingExcludeItemTemplate>template);
		} else if (templateId === SETTINGS_COMPLEX_TEMPLATE_ID) {
			this.renderComplexSetting(element, <ISettingComplexItemTemplate>template);
		}
	}

	private renderBool(dataElement: SettingsTreeSettingElement, template: ISettingBoolItemTemplate, onChange: (value: boolean) => void): void {
		template.onChange = null;
		template.checkbox.checked = dataElement.value;
		template.onChange = onChange;

		// Setup and add ARIA attributes
		this.setElementAriaLabels(dataElement, SETTINGS_BOOL_TEMPLATE_ID, template);
	}

	private renderEnum(dataElement: SettingsTreeSettingElement, template: ISettingEnumItemTemplate, onChange: (value: string) => void): void {
		const displayOptions = dataElement.setting.enum
			.map(String)
			.map(escapeInvisibleChars);

		template.selectBox.setOptions(displayOptions);
		const enumDescriptions = dataElement.setting.enumDescriptions;
		const enumDescriptionsAreMarkdown = dataElement.setting.enumDescriptionsAreMarkdown;
		template.selectBox.setDetailsProvider(index =>
			({
				details: enumDescriptions && enumDescriptions[index] && (enumDescriptionsAreMarkdown ? fixSettingLinks(enumDescriptions[index], false) : enumDescriptions[index]),
				isMarkdown: enumDescriptionsAreMarkdown
			}));

		const label = this.setElementAriaLabels(dataElement, SETTINGS_ENUM_TEMPLATE_ID, template);
		template.selectBox.setAriaLabel(label);

		const idx = dataElement.setting.enum.indexOf(dataElement.value);
		template.onChange = null;
		template.selectBox.select(idx);
		template.onChange = idx => onChange(dataElement.setting.enum[idx]);

		template.enumDescriptionElement.innerHTML = '';
	}

	private renderText(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, onChange: (value: string) => void): void {

		const label = this.setElementAriaLabels(dataElement, SETTINGS_TEXT_TEMPLATE_ID, template);

		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => { renderValidations(dataElement, template, false, label); onChange(value); };

		renderValidations(dataElement, template, true, label);
	}

	private renderNumber(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, onChange: (value: number) => void): void {
		const numParseFn = (dataElement.valueType === 'integer' || dataElement.valueType === 'nullable-integer')
			? parseInt : parseFloat;

		const nullNumParseFn = (dataElement.valueType === 'nullable-integer' || dataElement.valueType === 'nullable-number')
			? (v => v === '' ? null : numParseFn(v)) : numParseFn;

		const label = this.setElementAriaLabels(dataElement, SETTINGS_NUMBER_TEMPLATE_ID, template);

		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => { renderValidations(dataElement, template, false, label); onChange(nullNumParseFn(value)); };

		renderValidations(dataElement, template, true, label);
	}

	private renderExcludeSetting(dataElement: SettingsTreeSettingElement, template: ISettingExcludeItemTemplate): void {
		const value = getExcludeDisplayValue(dataElement);
		template.excludeWidget.setValue(value);
		template.context = dataElement;
	}

	private renderComplexSetting(dataElement: SettingsTreeSettingElement, template: ISettingComplexItemTemplate): void {
		template.onChange = () => this._onDidOpenSettings.fire(dataElement.setting.key);
	}


	private setElementAriaLabels(dataElement: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate): string {
		// Create base Id for element references
		const baseId = (dataElement.displayCategory + '_' + dataElement.displayLabel).replace(/ /g, '_').toLowerCase();

		const modifiedText = template.otherOverridesElement.textContent ?
			template.otherOverridesElement.textContent : (dataElement.isConfigured ? localize('settings.Modified', ' Modified. ') : '');

		let itemElement = null;

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
			if (itemElement = template.controlElement.firstElementChild) {
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

	disposeTemplate(tree: ITree, templateId: string, template: IDisposableTemplate): void {
		dispose(template.toDispose);
	}
}

function renderValidations(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, calledOnStartup: boolean, originalAriaLabel: string) {
	if (dataElement.setting.validator) {
		const errMsg = dataElement.setting.validator(template.inputBox.value);
		if (errMsg) {
			DOM.addClass(template.containerElement, 'invalid-input');
			template.validationErrorMessageElement.innerText = errMsg;
			const validationError = localize('validationError', "Validation Error.");
			template.inputBox.inputElement.parentElement.setAttribute('aria-label', [originalAriaLabel, validationError, errMsg].join(' '));
			if (!calledOnStartup) { ariaAlert(validationError + ' ' + errMsg); }
			return;
		} else {
			template.inputBox.inputElement.parentElement.setAttribute('aria-label', originalAriaLabel);
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

export class SettingsTreeFilter implements IFilter {
	constructor(
		private viewState: ISettingsEditorViewState,
	) { }

	isVisible(tree: ITree, element: SettingsTreeElement): boolean {
		// Filter during search
		if (this.viewState.filterToCategory && element instanceof SettingsTreeSettingElement) {
			if (!this.settingContainedInGroup(element.setting, this.viewState.filterToCategory)) {
				return false;
			}
		}

		// Non-user scope selected
		if (element instanceof SettingsTreeSettingElement && this.viewState.settingsTarget !== ConfigurationTarget.USER) {
			if (!element.matchesScope(this.viewState.settingsTarget)) {
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

			return element.children.some(child => this.isVisible(tree, child));
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

export class SettingsTreeController extends WorkbenchTreeController {
	constructor(
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({}, configurationService);
	}

	protected onLeftClick(tree: ITree, element: any, eventish: IMouseEvent, origin?: string): boolean {
		const isLink = eventish.target.tagName.toLowerCase() === 'a' ||
			eventish.target.parentElement.tagName.toLowerCase() === 'a'; // <code> inside <a>

		if (isLink && (DOM.findParentWithClass(eventish.target, 'setting-item-description-markdown', tree.getHTMLElement()) || DOM.findParentWithClass(eventish.target, 'select-box-description-markdown'))) {
			return true;
		}

		return false;
	}
}

export class SettingsAccessibilityProvider implements IAccessibilityProvider {
	getAriaLabel(tree: ITree, element: SettingsTreeElement): string {
		if (!element) {
			return '';
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (element.valueType === 'boolean') {
				return '';
			}
			return localize('settingRowAriaLabel', "{0} {1}, Setting", element.displayCategory, element.displayLabel);
		}

		if (element instanceof SettingsTreeGroupElement) {
			return localize('groupRowAriaLabel', "{0}, group", element.label);
		}

		return '';
	}
}

class NonExpandableOrSelectableTree extends Tree {
	expand(): TPromise<any> {
		return TPromise.wrap(null);
	}

	collapse(): TPromise<any> {
		return TPromise.wrap(null);
	}

	public setFocus(element?: any, eventPayload?: any): void {
		return;
	}

	public focusNext(count?: number, eventPayload?: any): void {
		return;
	}

	public focusPrevious(count?: number, eventPayload?: any): void {
		return;
	}

	public focusParent(eventPayload?: any): void {
		return;
	}

	public focusFirstChild(eventPayload?: any): void {
		return;
	}

	public focusFirst(eventPayload?: any, from?: any): void {
		return;
	}

	public focusNth(index: number, eventPayload?: any): void {
		return;
	}

	public focusLast(eventPayload?: any, from?: any): void {
		return;
	}

	public focusNextPage(eventPayload?: any): void {
		return;
	}

	public focusPreviousPage(eventPayload?: any): void {
		return;
	}

	public select(element: any, eventPayload?: any): void {
		return;
	}

	public selectRange(fromElement: any, toElement: any, eventPayload?: any): void {
		return;
	}

	public selectAll(elements: any[], eventPayload?: any): void {
		return;
	}

	public setSelection(elements: any[], eventPayload?: any): void {
		return;
	}

	public toggleSelection(element: any, eventPayload?: any): void {
		return;
	}
}

export class SettingsTree extends NonExpandableOrSelectableTree {
	protected disposables: IDisposable[];

	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		configuration: Partial<ITreeConfiguration>,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const treeClass = 'settings-editor-tree';

		const controller = instantiationService.createInstance(SettingsTreeController);
		const fullConfiguration = <ITreeConfiguration>{
			controller,
			accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),
			filter: instantiationService.createInstance(SettingsTreeFilter, viewState),
			styler: new DefaultTreestyler(DOM.createStyleSheet(container), treeClass),

			...configuration
		};

		const options = {
			ariaLabel: localize('treeAriaLabel', "Settings"),
			showLoading: false,
			indentPixels: 0,
			twistiePixels: 20, // Actually for gear button
		};

		super(container,
			fullConfiguration,
			options);

		this.disposables = [];
		this.disposables.push(controller);

		this.disposables.push(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-tree:focus .monaco-tree-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, .9));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description { color: ${fgWithOpacity}; }`);
			}

			const errorColor = theme.getColor(errorForeground);
			if (errorColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-deprecation-message { color: ${errorColor}; }`);
			}

			const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
			if (invalidInputBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
			}

			const invalidInputForeground = theme.getColor(inputValidationErrorForeground);
			if (invalidInputForeground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-validation-message { color: ${invalidInputForeground}; }`);
			}

			const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
			if (invalidInputBorder) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
			}

			const headerForegroundColor = theme.getColor(settingsHeaderForeground);
			if (headerForegroundColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .settings-group-title-label { color: ${headerForegroundColor}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-label { color: ${headerForegroundColor}; }`);
			}

			const focusBorderColor = theme.getColor(focusBorder);
			if (focusBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description-markdown a:focus { outline-color: ${focusBorderColor} }`);
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
			listInactiveSelectionForeground: foreground
		}, colors => {
			this.style(colors);
		}));
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

class CopySettingIdAction extends Action {
	static readonly ID = 'settings.copySettingId';
	static readonly LABEL = localize('copySettingIdLabel', "Copy Setting ID");

	constructor(
		@IClipboardService private clipboardService: IClipboardService
	) {
		super(CopySettingIdAction.ID, CopySettingIdAction.LABEL);
	}

	run(context: SettingsTreeSettingElement): TPromise<void> {
		if (context) {
			this.clipboardService.writeText(context.setting.key);
		}

		return TPromise.as(null);
	}
}

class CopySettingAsJSONAction extends Action {
	static readonly ID = 'settings.copySettingAsJSON';
	static readonly LABEL = localize('copySettingAsJSONLabel', "Copy Setting as JSON");

	constructor(
		@IClipboardService private clipboardService: IClipboardService
	) {
		super(CopySettingAsJSONAction.ID, CopySettingAsJSONAction.LABEL);
	}

	run(context: SettingsTreeSettingElement): TPromise<void> {
		if (context) {
			const jsonResult = `"${context.setting.key}": ${JSON.stringify(context.value, undefined, '  ')}`;
			this.clipboardService.writeText(jsonResult);
		}

		return TPromise.as(null);
	}
}
