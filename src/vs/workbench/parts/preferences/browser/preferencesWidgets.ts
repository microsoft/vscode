/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Dimension } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { Widget } from 'vs/base/browser/ui/widget';
import Event, { Emitter } from 'vs/base/common/event';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference, IViewZone } from 'vs/editor/browser/editorBrowser';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ISettingsGroup } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';

export class SettingsGroupTitleWidget extends Widget implements IViewZone {

	private id: number;
	private _afterLineNumber: number;
	private _domNode: HTMLElement;

	private titleContainer: HTMLElement;
	private icon: HTMLElement;
	private title: HTMLElement;

	private _onToggled = this._register(new Emitter<boolean>());
	public onToggled: Event<boolean> = this._onToggled.event;

	private previousPosition: editorCommon.IPosition;

	constructor(private editor: ICodeEditor, public settingsGroup: ISettingsGroup) {
		super();
		this.create();
		this._register(this.editor.onDidChangeConfiguration(() => this.layout()));
		this._register(this.editor.onDidLayoutChange(() => this.layout()));
		this._register(this.editor.onDidChangeCursorPosition((e) => this.onCursorChange(e)));
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}

	get heightInLines(): number {
		return 1.5;
	}

	get afterLineNumber(): number {
		return this._afterLineNumber;
	}

	private create() {
		this._domNode = DOM.$('.settings-group-title-widget');

		this.titleContainer = DOM.append(this._domNode, DOM.$('.title-container'));
		this.titleContainer.tabIndex = 0;
		this.onclick(this.titleContainer, () => this.toggle());
		this.onkeydown(this.titleContainer, (e) => this.onKeyDown(e));
		const focusTracker = this._register(DOM.trackFocus(this.titleContainer));
		focusTracker.addFocusListener(() => this.toggleFocus(true));
		focusTracker.addBlurListener(() => this.toggleFocus(false));

		this.icon = DOM.append(this.titleContainer, DOM.$('.expand-collapse-icon'));
		this.title = DOM.append(this.titleContainer, DOM.$('.title'));
		this.title.textContent = this.settingsGroup.title + ` (${this.settingsGroup.sections.reduce((count, section) => count + section.settings.length, 0)})`;

		this.layout();
	}

	public render() {
		this._afterLineNumber = this.settingsGroup.range.startLineNumber - 2;
		this.editor.changeViewZones(accessor => {
			this.id = accessor.addZone(this);
		});
	}

	public toggleCollapse(collapse: boolean) {
		DOM.toggleClass(this.titleContainer, 'collapsed', collapse);
	}

	public toggleFocus(focus: boolean): void {
		DOM.toggleClass(this.titleContainer, 'focused', focus);
	}

	public isCollapsed(): boolean {
		return DOM.hasClass(this.titleContainer, 'collapsed');
	}

	private layout(): void {
		const configuration = this.editor.getConfiguration();
		const layoutInfo = this.editor.getLayoutInfo();
		this.titleContainer.style.width = layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth + 'px';
		this.titleContainer.style.lineHeight = configuration.lineHeight + 3 + 'px';
		this.titleContainer.style.fontSize = configuration.fontInfo.fontSize + 'px';
		const iconSize = this.getIconSize();
		this.icon.style.height = `${iconSize}px`;
		this.icon.style.width = `${iconSize}px`;
	}

	private getIconSize(): number {
		const fontSize = this.editor.getConfiguration().fontInfo.fontSize;
		return fontSize > 8 ? Math.max(fontSize, 16) : 12;
	}

	private onKeyDown(keyboardEvent: IKeyboardEvent): void {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
			case KeyCode.Space:
				this.toggle();
				break;
			case KeyCode.LeftArrow:
				this.collapse(true);
				break;
			case KeyCode.RightArrow:
				this.collapse(false);
				break;
			case KeyCode.UpArrow:
				if (this.settingsGroup.range.startLineNumber - 3 !== 1) {
					this.editor.focus();
					const lineNumber = this.settingsGroup.range.startLineNumber - 2;
					this.editor.setPosition({ lineNumber, column: this.editor.getModel().getLineMinColumn(lineNumber) });
				}
				break;
			case KeyCode.DownArrow:
				const lineNumber = this.isCollapsed() ? this.settingsGroup.range.startLineNumber : this.settingsGroup.range.startLineNumber - 1;
				this.editor.focus();
				this.editor.setPosition({ lineNumber, column: this.editor.getModel().getLineMinColumn(lineNumber) });
				break;
		}
	}

	private toggle() {
		this.collapse(!this.isCollapsed());
	}

	private collapse(collapse: boolean) {
		if (collapse !== this.isCollapsed()) {
			DOM.toggleClass(this.titleContainer, 'collapsed', collapse);
			this._onToggled.fire(collapse);
		}
	}

	private onCursorChange(e: editorCommon.ICursorPositionChangedEvent): void {
		if (e.source !== 'mouse' && this.focusTitle(e.position)) {
			this.titleContainer.focus();
		}
	}

	private focusTitle(currentPosition: editorCommon.IPosition): boolean {
		const previousPosition = this.previousPosition;
		this.previousPosition = currentPosition;
		if (!previousPosition) {
			return false;
		}
		if (previousPosition.lineNumber === currentPosition.lineNumber) {
			return false;
		}
		if (currentPosition.lineNumber === this.settingsGroup.range.startLineNumber - 1 || currentPosition.lineNumber === this.settingsGroup.range.startLineNumber - 2) {
			return true;
		}
		if (this.isCollapsed() && currentPosition.lineNumber === this.settingsGroup.range.endLineNumber) {
			return true;
		}
		return false;
	}

	public dispose() {
		this.editor.changeViewZones(accessor => {
			accessor.removeZone(this.id);
		});
		super.dispose();
	}
}

export class SettingsTabsWidget extends Widget {

	private settingsSwitcherBar: ActionBar;
	private userSettings: Action;
	private workspaceSettings: Action;

	private _onSwitch: Emitter<void> = new Emitter<void>();
	public readonly onSwitch: Event<void> = this._onSwitch.event;

	constructor(parent: HTMLElement, @IWorkspaceContextService private contextService: IWorkspaceContextService, ) {
		super();
		this.create(parent);
	}

	private create(parent: HTMLElement): void {
		const settingsTabsWidget = DOM.append(parent, DOM.$('.settings-tabs-widget'));
		this.settingsSwitcherBar = this._register(new ActionBar(settingsTabsWidget, {
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('settingsSwitcherBarAriaLabel', "Settings Switcher"),
			animated: false
		}));
		this.userSettings = new Action('userSettings', localize('userSettings', "User Settings"), '.settings-tab', true, () => this.onClick(this.userSettings));
		this.userSettings.tooltip = this.userSettings.label;
		this.workspaceSettings = new Action('workspaceSettings', localize('workspaceSettings', "Workspace Settings"), '.settings-tab', this.contextService.hasWorkspace(), () => this.onClick(this.workspaceSettings));
		this.workspaceSettings.tooltip = this.workspaceSettings.label;

		this.settingsSwitcherBar.push([this.userSettings, this.workspaceSettings]);
	}

	public show(configurationTarget: ConfigurationTarget): void {
		this.userSettings.checked = ConfigurationTarget.USER === configurationTarget;
		this.workspaceSettings.checked = ConfigurationTarget.WORKSPACE === configurationTarget;
	}

	private onClick(action: Action): TPromise<any> {
		if (!action.checked) {
			this._onSwitch.fire();
		}
		return TPromise.as(null);
	}
}

export class SearchWidget extends Widget {

	public domNode: HTMLElement;

	private countElement: HTMLElement;
	private searchContainer: HTMLElement;
	private inputBox: InputBox;

	private _onDidChange = this._register(new Emitter<string>());
	public onDidChange: Event<string> = this._onDidChange.event;

	private _onEnter = this._register(new Emitter<void>());
	public onEnter: Event<void> = this._onEnter.event;

	constructor(parent: HTMLElement,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this.create(parent);
	}

	private create(parent: HTMLElement) {
		this.domNode = DOM.append(parent, DOM.$('div.settings-header-widget'));
		this.createSearchContainer(DOM.append(this.domNode, DOM.$('div.settings-search-container')));
		this.countElement = DOM.append(this.domNode, DOM.$('.settings-count-widget'));
		this.inputBox.inputElement.setAttribute('aria-live', 'assertive');
	}

	private createSearchContainer(searchContainer: HTMLElement) {
		this.searchContainer = searchContainer;
		const searchInput = DOM.append(this.searchContainer, DOM.$('div.settings-search-input'));
		this.inputBox = this._register(new InputBox(searchInput, this.contextViewService, {
			ariaLabel: localize('SearchSettingsWidget.AriaLabel', "Search settings"),
			placeholder: localize('SearchSettingsWidget.Placeholder', "Search Settings")
		}));
		this.inputBox.onDidChange(value => this._onDidChange.fire(value));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp(e));
	}

	public showMessage(message: string, count: number): void {
		this.countElement.textContent = message;
		this.inputBox.inputElement.setAttribute('aria-label', message);
		DOM.toggleClass(this.countElement, 'no-results', count === 0);
		this.inputBox.inputElement.style.paddingRight = DOM.getTotalWidth(this.countElement) + 20 + 'px';
	}

	public layout(dimension: Dimension) {
		if (dimension.width < 400) {
			DOM.addClass(this.countElement, 'hide');
			this.inputBox.inputElement.style.paddingRight = '0px';
		} else {
			DOM.removeClass(this.countElement, 'hide');
			this.inputBox.inputElement.style.paddingRight = DOM.getTotalWidth(this.countElement) + 20 + 'px';
		}

	}

	public focus() {
		this.inputBox.focus();
	}

	public clear() {
		this.inputBox.value = '';
	}

	public value(): string {
		return this.inputBox.value;
	}

	private _onKeyUp(keyboardEvent: IKeyboardEvent): void {
		let handled = false;
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this._onEnter.fire();
				handled = true;
				break;
			case KeyCode.Escape:
				this.clear();
				handled = true;
				break;
		}
		if (handled) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
		}
	}
}

export class FloatingClickWidget extends Widget implements IOverlayWidget {

	private _domNode: HTMLElement;

	private _onClick: Emitter<void> = this._register(new Emitter<void>());
	public onClick: Event<void> = this._onClick.event;

	constructor(private editor: ICodeEditor, private label: string, private keyBindingAction: string,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();
		if (keyBindingAction) {
			let keybinding = keybindingService.lookupKeybindings(keyBindingAction);
			if (keybinding.length > 0) {
				this.label += ' (' + keybindingService.getLabelFor(keybinding[0]) + ')';
			}
		}
	}

	public render() {
		this._domNode = DOM.$('.floating-click-widget');
		DOM.append(this._domNode, DOM.$('')).textContent = this.label;
		this.onclick(this._domNode, e => this._onClick.fire());
		this.editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return 'editor.overlayWidget.floatingClickWidget';
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

export class EditPreferenceWidget<T> extends Widget implements IOverlayWidget {

	private static counter: number = 1;

	private _domNode: HTMLElement;
	private _visible: boolean;
	private _line: number;
	private _id: string;
	private _preferences: T[];

	private _onClick: Emitter<void> = new Emitter<void>();
	public get onClick(): Event<void> { return this._onClick.event; }

	private _onMouseOver: Emitter<void> = new Emitter<void>();
	public get onMouseOver(): Event<void> { return this._onMouseOver.event; }

	constructor(private editor: ICodeEditor,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super();
		this._id = 'preferences.editPreferenceWidget' + EditPreferenceWidget.counter++;
		this.editor.addOverlayWidget(this);
		this._register(this.editor.onDidScrollChange(() => {
			if (this._visible) {
				this._layout();
			}
		}));
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.style.width = '20px';
			this._domNode.style.height = '20px';
			this._domNode.className = 'edit-preferences-widget hidden';
			this.onclick(this._domNode, e => this._onClick.fire());
			this.onmouseover(this._domNode, e => this._onMouseOver.fire());
		}
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return null;
	}

	getLine(): number {
		return this._line;
	}

	show(line: number, preferences: T[]): void {
		this._preferences = preferences;
		if (!this._visible || this._line !== line) {
			this._line = line;
			this._visible = true;
			this._layout();
		}
	}

	get preferences(): T[] {
		return this._preferences;
	}

	hide(): void {
		if (this._visible) {
			this._visible = false;
			this._domNode.classList.add('hidden');
		}
	}

	private _layout(): void {
		const topForLineNumber = this.editor.getTopForLineNumber(this._line);
		const editorScrollTop = this.editor.getScrollTop();

		this._domNode.style.top = `${topForLineNumber - editorScrollTop - 2}px`;
		this._domNode.style.left = '0px';
		this._domNode.classList.remove('hidden');
	}
}