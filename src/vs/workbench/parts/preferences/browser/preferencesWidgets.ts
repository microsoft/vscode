/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Dimension, $ } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Widget } from 'vs/base/browser/ui/widget';
import { Event, Emitter } from 'vs/base/common/event';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference, IViewZone, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { InputBox, IInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ISettingsGroup } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IAction, Action } from 'vs/base/common/actions';
import { attachInputBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { Position } from 'vs/editor/common/core/position';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { buttonBackground, buttonForeground, badgeForeground, badgeBackground, contrastBorder, errorForeground, focusBorder, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Separator, ActionBar, ActionsOrientation, BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND } from 'vs/workbench/common/theme';
import { IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';

export class SettingsHeaderWidget extends Widget implements IViewZone {

	private id: number;
	private _domNode: HTMLElement;

	protected titleContainer: HTMLElement;
	private messageElement: HTMLElement;

	constructor(protected editor: ICodeEditor, private title: string) {
		super();
		this.create();
		this._register(this.editor.onDidChangeConfiguration(() => this.layout()));
		this._register(this.editor.onDidLayoutChange(() => this.layout()));
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}

	get heightInLines(): number {
		return 1;
	}

	get afterLineNumber(): number {
		return 0;
	}

	protected create() {
		this._domNode = DOM.$('.settings-header-widget');

		this.titleContainer = DOM.append(this._domNode, DOM.$('.title-container'));
		if (this.title) {
			DOM.append(this.titleContainer, DOM.$('.title')).textContent = this.title;
		}
		this.messageElement = DOM.append(this.titleContainer, DOM.$('.message'));
		if (this.title) {
			this.messageElement.style.paddingLeft = '12px';
		}

		this.editor.changeViewZones(accessor => {
			this.id = accessor.addZone(this);
			this.layout();
		});
	}

	public setMessage(message: string): void {
		this.messageElement.textContent = message;
	}

	private layout(): void {
		const configuration = this.editor.getConfiguration();
		this.titleContainer.style.fontSize = configuration.fontInfo.fontSize + 'px';
		if (!configuration.contribInfo.folding) {
			this.titleContainer.style.paddingLeft = '6px';
		}
	}

	public dispose() {
		this.editor.changeViewZones(accessor => {
			accessor.removeZone(this.id);
		});
		super.dispose();
	}
}

export class DefaultSettingsHeaderWidget extends SettingsHeaderWidget {

	private _onClick = this._register(new Emitter<void>());
	public readonly onClick: Event<void> = this._onClick.event;

	protected create() {
		super.create();

		this.toggleMessage(true);
	}

	public toggleMessage(hasSettings: boolean): void {
		if (hasSettings) {
			this.setMessage(localize('defaultSettings', "Place your settings in the right hand side editor to override."));
		} else {
			this.setMessage(localize('noSettingsFound', "No Settings Found."));
		}
	}
}

export class SettingsGroupTitleWidget extends Widget implements IViewZone {

	private id: number;
	private _afterLineNumber: number;
	private _domNode: HTMLElement;

	private titleContainer: HTMLElement;
	private icon: HTMLElement;
	private title: HTMLElement;

	private _onToggled = this._register(new Emitter<boolean>());
	public readonly onToggled: Event<boolean> = this._onToggled.event;

	private previousPosition: Position;

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

		this._register(focusTracker.onDidFocus(() => this.toggleFocus(true)));
		this._register(focusTracker.onDidBlur(() => this.toggleFocus(false)));

		this.icon = DOM.append(this.titleContainer, DOM.$('.expand-collapse-icon'));
		this.title = DOM.append(this.titleContainer, DOM.$('.title'));
		this.title.textContent = this.settingsGroup.title + ` (${this.settingsGroup.sections.reduce((count, section) => count + section.settings.length, 0)})`;

		this.layout();
	}

	public render() {
		this._afterLineNumber = this.settingsGroup.range.startLineNumber - 2;
		this.editor.changeViewZones(accessor => {
			this.id = accessor.addZone(this);
			this.layout();
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
		this._domNode.style.width = layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth + 'px';
		this.titleContainer.style.lineHeight = configuration.lineHeight + 3 + 'px';
		this.titleContainer.style.height = configuration.lineHeight + 3 + 'px';
		this.titleContainer.style.fontSize = configuration.fontInfo.fontSize + 'px';
		this.icon.style.minWidth = `${this.getIconSize(16)}px`;
	}

	private getIconSize(minSize: number): number {
		const fontSize = this.editor.getConfiguration().fontInfo.fontSize;
		return fontSize > 8 ? Math.max(fontSize, minSize) : 12;
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

	private onCursorChange(e: ICursorPositionChangedEvent): void {
		if (e.source !== 'mouse' && this.focusTitle(e.position)) {
			this.titleContainer.focus();
		}
	}

	private focusTitle(currentPosition: Position): boolean {
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

export class FolderSettingsActionItem extends BaseActionItem {

	private _folder: IWorkspaceFolder;
	private _folderSettingCounts = new Map<string, number>();

	private container: HTMLElement;
	private anchorElement: HTMLElement;
	private labelElement: HTMLElement;
	private detailsElement: HTMLElement;
	private dropDownElement: HTMLElement;

	private disposables: IDisposable[] = [];

	constructor(
		action: IAction,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(null, action);
		const workspace = this.contextService.getWorkspace();
		this._folder = workspace.folders.length === 1 ? workspace.folders[0] : null;
		this.disposables.push(this.contextService.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged()));
	}

	get folder(): IWorkspaceFolder {
		return this._folder;
	}

	set folder(folder: IWorkspaceFolder) {
		this._folder = folder;
		this.update();
	}

	public setCount(settingsTarget: URI, count: number): void {
		const folder = this.contextService.getWorkspaceFolder(settingsTarget).uri;
		this._folderSettingCounts.set(folder.toString(), count);
		this.update();
	}

	public render(container: HTMLElement): void {
		this.builder = $(container);

		this.container = container;
		this.labelElement = DOM.$('.action-title');
		this.detailsElement = DOM.$('.action-details');
		this.dropDownElement = DOM.$('.dropdown-icon.octicon.octicon-triangle-down.hide');
		this.anchorElement = DOM.$('a.action-label.folder-settings', {
			role: 'button',
			'aria-haspopup': 'true',
			'tabindex': '0'
		}, this.labelElement, this.detailsElement, this.dropDownElement);
		this.disposables.push(DOM.addDisposableListener(this.anchorElement, DOM.EventType.CLICK, e => this.onClick(e)));
		this.disposables.push(DOM.addDisposableListener(this.anchorElement, DOM.EventType.KEY_UP, e => this.onKeyUp(e)));

		DOM.append(this.container, this.anchorElement);

		this.update();
	}

	private onKeyUp(event: any): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
			case KeyCode.Space:
				this.onClick(event);
				return;
		}
	}

	public onClick(event: DOM.EventLike): void {
		DOM.EventHelper.stop(event, true);
		if (!this.folder || this._action.checked) {
			this.showMenu();
		} else {
			this._action.run(this._folder);
		}
	}

	protected _updateEnabled(): void {
		this.update();
	}

	protected _updateChecked(): void {
		this.update();
	}

	private onWorkspaceFoldersChanged(): void {
		const oldFolder = this._folder;
		const workspace = this.contextService.getWorkspace();
		if (this._folder) {
			this._folder = workspace.folders.filter(folder => folder.uri.toString() === this._folder.uri.toString())[0] || workspace.folders[0];
		}
		this._folder = this._folder ? this._folder : workspace.folders.length === 1 ? workspace.folders[0] : null;

		this.update();

		if (this._action.checked) {
			if ((oldFolder || !this._folder)
				|| (!oldFolder || this._folder)
				|| (oldFolder && this._folder && oldFolder.uri.toString() === this._folder.uri.toString())) {
				this._action.run(this._folder);
			}
		}
	}

	private update(): void {
		let total = 0;
		this._folderSettingCounts.forEach(n => total += n);

		const workspace = this.contextService.getWorkspace();
		if (this._folder) {
			this.labelElement.textContent = this._folder.name;
			this.anchorElement.title = this._folder.name;
			const detailsText = this.labelWithCount(this._action.label, total);
			this.detailsElement.textContent = detailsText;
			DOM.toggleClass(this.dropDownElement, 'hide', workspace.folders.length === 1 || !this._action.checked);
		} else {
			const labelText = this.labelWithCount(this._action.label, total);
			this.labelElement.textContent = labelText;
			this.detailsElement.textContent = '';
			this.anchorElement.title = this._action.label;
			DOM.removeClass(this.dropDownElement, 'hide');
		}
		DOM.toggleClass(this.anchorElement, 'checked', this._action.checked);
		DOM.toggleClass(this.container, 'disabled', !this._action.enabled);
	}

	private showMenu(): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => this.container,
			getActions: () => TPromise.as(this.getDropdownMenuActions()),
			getActionItem: (action) => null,
			onHide: () => {
				this.anchorElement.blur();
			}
		});
	}

	private getDropdownMenuActions(): IAction[] {
		const actions: IAction[] = [];
		const workspaceFolders = this.contextService.getWorkspace().folders;
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && workspaceFolders.length > 0) {
			actions.push(new Separator());
			actions.push(...workspaceFolders.map((folder, index) => {
				const folderCount = this._folderSettingCounts.get(folder.uri.toString());
				return <IAction>{
					id: 'folderSettingsTarget' + index,
					label: this.labelWithCount(folder.name, folderCount),
					checked: this.folder && this.folder.uri.toString() === folder.uri.toString(),
					enabled: true,
					run: () => this._action.run(folder)
				};
			}));
		}
		return actions;
	}

	private labelWithCount(label: string, count: number | undefined): string {
		// Append the count if it's >0 and not undefined
		if (count) {
			label += ` (${count})`;
		}

		return label;
	}

	public dispose(): void {
		dispose(this.disposables);
		super.dispose();
	}
}

export type SettingsTarget = ConfigurationTarget.USER | ConfigurationTarget.WORKSPACE | URI;

export class SettingsTargetsWidget extends Widget {

	private settingsSwitcherBar: ActionBar;
	private userSettings: Action;
	private workspaceSettings: Action;
	private folderSettings: FolderSettingsActionItem;

	private _settingsTarget: SettingsTarget;

	private readonly _onDidTargetChange: Emitter<SettingsTarget> = new Emitter<SettingsTarget>();
	public readonly onDidTargetChange: Event<SettingsTarget> = this._onDidTargetChange.event;

	constructor(
		parent: HTMLElement,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this.create(parent);
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onWorkbenchStateChanged()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
	}

	private create(parent: HTMLElement): void {
		const settingsTabsWidget = DOM.append(parent, DOM.$('.settings-tabs-widget'));
		this.settingsSwitcherBar = this._register(new ActionBar(settingsTabsWidget, {
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('settingsSwitcherBarAriaLabel', "Settings Switcher"),
			animated: false,
			actionItemProvider: (action: Action) => action.id === 'folderSettings' ? this.folderSettings : null
		}));

		this.userSettings = new Action('userSettings', localize('userSettings', "User Settings"), '.settings-tab', true, () => this.updateTarget(ConfigurationTarget.USER));
		this.userSettings.tooltip = this.userSettings.label;

		this.workspaceSettings = new Action('workspaceSettings', localize('workspaceSettings', "Workspace Settings"), '.settings-tab', false, () => this.updateTarget(ConfigurationTarget.WORKSPACE));
		this.workspaceSettings.tooltip = this.workspaceSettings.label;

		const folderSettingsAction = new Action('folderSettings', localize('folderSettings', "Folder Settings"), '.settings-tab', false, (folder: IWorkspaceFolder) => this.updateTarget(folder ? folder.uri : ConfigurationTarget.USER));
		this.folderSettings = this.instantiationService.createInstance(FolderSettingsActionItem, folderSettingsAction);

		this.update();

		this.settingsSwitcherBar.push([this.userSettings, this.workspaceSettings, folderSettingsAction]);
	}

	public get settingsTarget(): SettingsTarget {
		return this._settingsTarget;
	}

	public set settingsTarget(settingsTarget: SettingsTarget) {
		this._settingsTarget = settingsTarget;
		this.userSettings.checked = ConfigurationTarget.USER === this.settingsTarget;
		this.workspaceSettings.checked = ConfigurationTarget.WORKSPACE === this.settingsTarget;
		if (this.settingsTarget instanceof URI) {
			this.folderSettings.getAction().checked = true;
			this.folderSettings.folder = this.contextService.getWorkspaceFolder(this.settingsTarget as URI);
		} else {
			this.folderSettings.getAction().checked = false;
		}
	}

	public setResultCount(settingsTarget: SettingsTarget, count: number): void {
		if (settingsTarget === ConfigurationTarget.WORKSPACE) {
			let label = localize('workspaceSettings', "Workspace Settings");
			if (count) {
				label += ` (${count})`;
			}

			this.workspaceSettings.label = label;
		} else if (settingsTarget === ConfigurationTarget.USER) {
			let label = localize('userSettings', "User Settings");
			if (count) {
				label += ` (${count})`;
			}

			this.userSettings.label = label;
		} else if (settingsTarget instanceof URI) {
			this.folderSettings.setCount(settingsTarget, count);
		}
	}

	private onWorkbenchStateChanged(): void {
		this.folderSettings.folder = null;
		this.update();
		if (this.settingsTarget === ConfigurationTarget.WORKSPACE && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.updateTarget(ConfigurationTarget.USER);
		}
	}

	private updateTarget(settingsTarget: SettingsTarget): TPromise<void> {
		const isSameTarget = this.settingsTarget === settingsTarget || settingsTarget instanceof URI && this.settingsTarget instanceof URI && this.settingsTarget.toString() === settingsTarget.toString();
		if (!isSameTarget) {
			this.settingsTarget = settingsTarget;
			this._onDidTargetChange.fire(this.settingsTarget);
		}
		return TPromise.as(null);
	}

	private update(): void {
		DOM.toggleClass(this.settingsSwitcherBar.domNode, 'empty-workbench', this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);
		this.workspaceSettings.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
		this.folderSettings.getAction().enabled = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.contextService.getWorkspace().folders.length > 0;
	}

}

export interface SearchOptions extends IInputOptions {
	focusKey?: IContextKey<boolean>;
	showResultCount?: boolean;
}

export class SearchWidget extends Widget {

	public domNode: HTMLElement;

	private countElement: HTMLElement;
	private searchContainer: HTMLElement;
	private inputBox: InputBox;
	private controlsDiv: HTMLElement;

	private readonly _onDidChange: Emitter<string> = this._register(new Emitter<string>());
	public readonly onDidChange: Event<string> = this._onDidChange.event;

	private readonly _onFocus: Emitter<void> = this._register(new Emitter<void>());
	public readonly onFocus: Event<void> = this._onFocus.event;

	constructor(parent: HTMLElement, protected options: SearchOptions,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
		super();
		this.create(parent);
	}

	private create(parent: HTMLElement) {
		this.domNode = DOM.append(parent, DOM.$('div.settings-header-widget'));
		this.createSearchContainer(DOM.append(this.domNode, DOM.$('div.settings-search-container')));
		this.controlsDiv = DOM.append(this.domNode, DOM.$('div.settings-search-controls'));

		if (this.options.showResultCount) {
			this.countElement = DOM.append(this.controlsDiv, DOM.$('.settings-count-widget'));
			this._register(attachStylerCallback(this.themeService, { badgeBackground, contrastBorder }, colors => {
				const background = colors.badgeBackground ? colors.badgeBackground.toString() : null;
				const border = colors.contrastBorder ? colors.contrastBorder.toString() : null;

				this.countElement.style.backgroundColor = background;

				this.countElement.style.borderWidth = border ? '1px' : null;
				this.countElement.style.borderStyle = border ? 'solid' : null;
				this.countElement.style.borderColor = border;

				this.styleCountElementForeground();
			}));
		}

		this.inputBox.inputElement.setAttribute('aria-live', 'assertive');
		const focusTracker = this._register(DOM.trackFocus(this.inputBox.inputElement));
		this._register(focusTracker.onDidFocus(() => this._onFocus.fire()));

		if (this.options.focusKey) {
			this._register(focusTracker.onDidFocus(() => this.options.focusKey.set(true)));
			this._register(focusTracker.onDidBlur(() => this.options.focusKey.set(false)));
		}
	}

	private createSearchContainer(searchContainer: HTMLElement) {
		this.searchContainer = searchContainer;
		const searchInput = DOM.append(this.searchContainer, DOM.$('div.settings-search-input'));
		this.inputBox = this._register(this.createInputBox(searchInput));
		this._register(this.inputBox.onDidChange(value => this._onDidChange.fire(value)));
	}

	protected createInputBox(parent: HTMLElement): InputBox {
		const box = this._register(new InputBox(parent, this.contextViewService, this.options));
		this._register(attachInputBoxStyler(box, this.themeService));

		return box;
	}

	public showMessage(message: string, count: number): void {
		if (this.countElement) {
			this.countElement.textContent = message;
			this.inputBox.inputElement.setAttribute('aria-label', message);
			DOM.toggleClass(this.countElement, 'no-results', count === 0);
			this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + 'px';
			this.styleCountElementForeground();
		}
	}

	private styleCountElementForeground() {
		const colorId = DOM.hasClass(this.countElement, 'no-results') ? errorForeground : badgeForeground;
		const color = this.themeService.getTheme().getColor(colorId);
		this.countElement.style.color = color ? color.toString() : null;
	}

	public layout(dimension: Dimension) {
		if (dimension.width < 400) {
			if (this.countElement) {
				DOM.addClass(this.countElement, 'hide');
			}

			this.inputBox.inputElement.style.paddingRight = '0px';
		} else {
			if (this.countElement) {
				DOM.removeClass(this.countElement, 'hide');
			}

			this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + 'px';
		}
	}

	private getControlsWidth(): number {
		const countWidth = this.countElement ? DOM.getTotalWidth(this.countElement) : 0;
		return countWidth + 20;
	}

	public focus() {
		this.inputBox.focus();
		if (this.getValue()) {
			this.inputBox.select();
		}
	}

	public hasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	public clear() {
		this.inputBox.value = '';
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): string {
		return this.inputBox.value = value;
	}

	public dispose(): void {
		if (this.options.focusKey) {
			this.options.focusKey.set(false);
		}
		super.dispose();
	}
}

export class FloatingClickWidget extends Widget implements IOverlayWidget {

	private _domNode: HTMLElement;

	private readonly _onClick: Emitter<void> = this._register(new Emitter<void>());
	public readonly onClick: Event<void> = this._onClick.event;

	constructor(
		private editor: ICodeEditor,
		private label: string,
		keyBindingAction: string,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService private themeService: IThemeService
	) {
		super();

		if (keyBindingAction) {
			let keybinding = keybindingService.lookupKeybinding(keyBindingAction);
			if (keybinding) {
				this.label += ' (' + keybinding.getLabel() + ')';
			}
		}
	}

	public render() {
		this._domNode = DOM.$('.floating-click-widget');
		this._register(attachStylerCallback(this.themeService, { buttonBackground, buttonForeground }, colors => {
			this._domNode.style.backgroundColor = colors.buttonBackground ? colors.buttonBackground.toString() : null;
			this._domNode.style.color = colors.buttonForeground ? colors.buttonForeground.toString() : null;
		}));

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

export class EditPreferenceWidget<T> extends Disposable {

	public static readonly GLYPH_MARGIN_CLASS_NAME = 'edit-preferences-widget';

	private _line: number;
	private _preferences: T[];

	private _editPreferenceDecoration: string[];

	private readonly _onClick: Emitter<IEditorMouseEvent> = new Emitter<IEditorMouseEvent>();
	public get onClick(): Event<IEditorMouseEvent> { return this._onClick.event; }

	constructor(private editor: ICodeEditor
	) {
		super();
		this._editPreferenceDecoration = [];
		this._register(this.editor.onMouseDown((e: IEditorMouseEvent) => {
			const data = e.target.detail as IMarginData;
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || data.isAfterLines || !this.isVisible()) {
				return;
			}
			this._onClick.fire(e);
		}));
	}

	get preferences(): T[] {
		return this._preferences;
	}

	getLine(): number {
		return this._line;
	}

	show(line: number, hoverMessage: string, preferences: T[]): void {
		this._preferences = preferences;
		const newDecoration: IModelDeltaDecoration[] = [];
		this._line = line;
		newDecoration.push({
			options: {
				glyphMarginClassName: EditPreferenceWidget.GLYPH_MARGIN_CLASS_NAME,
				glyphMarginHoverMessage: new MarkdownString().appendText(hoverMessage),
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			},
			range: {
				startLineNumber: line,
				startColumn: 1,
				endLineNumber: line,
				endColumn: 1
			}
		});
		this._editPreferenceDecoration = this.editor.deltaDecorations(this._editPreferenceDecoration, newDecoration);
	}

	hide(): void {
		this._editPreferenceDecoration = this.editor.deltaDecorations(this._editPreferenceDecoration, []);
	}

	isVisible(): boolean {
		return this._editPreferenceDecoration.length > 0;
	}

	dispose(): void {
		this.hide();
		super.dispose();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	collector.addRule(`
		.settings-tabs-widget > .monaco-action-bar .action-item .action-label:focus,
		.settings-tabs-widget > .monaco-action-bar .action-item .action-label.checked {
			border-bottom: 1px solid;
		}
	`);
	// Title Active
	const titleActive = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
	const titleActiveBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);
	if (titleActive || titleActiveBorder) {
		collector.addRule(`
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label:hover,
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label.checked {
				color: ${titleActive};
				border-bottom-color: ${titleActiveBorder};
			}
		`);
	}

	// Title Inactive
	const titleInactive = theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND);
	if (titleInactive) {
		collector.addRule(`
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label {
				color: ${titleInactive};
			}
		`);
	}

	// Title focus
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label:focus {
				border-bottom-color: ${focusBorderColor} !important;
			}
			`);
		collector.addRule(`
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label:focus {
				outline: none;
			}
			`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		const outline = theme.getColor(activeContrastBorder);

		collector.addRule(`
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label.checked,
			.settings-tabs-widget > .monaco-action-bar .action-item .action-label:hover {
				outline-color: ${outline};
				outline-width: 1px;
				outline-style: solid;
				border-bottom: none;
				padding-bottom: 0;
				outline-offset: 2px;
			}

			.settings-tabs-widget > .monaco-action-bar .action-item .action-label:not(.checked):hover {
				outline-style: dashed;
			}
		`);
	}
});
