/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
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
		this._domNode.style.paddingLeft = '10px';

		this.titleContainer = DOM.append(this._domNode, DOM.$('.title-container'));
		this.titleContainer.tabIndex = 1;
		this.onclick(this.titleContainer, () => this.onTitleClicked());
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

	public collapse() {
		DOM.addClass(this.titleContainer, 'collapsed');
	}

	public toggleFocus(focus: boolean): void {
		DOM.toggleClass(this.titleContainer, 'focused', focus);
	}

	private layout(): void {
		this.titleContainer.style.lineHeight = this.editor.getConfiguration().lineHeight + 3 + 'px';
		this.titleContainer.style.fontSize = this.editor.getConfiguration().fontInfo.fontSize + 3 + 'px';
		const iconSize = this.getIconSize();
		this.icon.style.height = `${iconSize}px`;
		this.icon.style.width = `${iconSize}px`;
	}

	private getIconSize(): number {
		const fontSize = this.editor.getConfiguration().fontInfo.fontSize;
		return fontSize > 8 ? Math.max(fontSize, 16) : 12;
	}

	private onTitleClicked() {
		const isCollapsed = this.isCollapsed();
		DOM.toggleClass(this.titleContainer, 'collapsed', !isCollapsed);
		this._onToggled.fire(!isCollapsed);
	}

	public isCollapsed(): boolean {
		return DOM.hasClass(this.titleContainer, 'collapsed');
	}

	private onKeyDown(keyboardEvent: IKeyboardEvent): void {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
			case KeyCode.Space:
				this.onTitleClicked();
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

	private onCursorChange(e: editorCommon.ICursorPositionChangedEvent): void {
		if (this.focusTitle(e.position)) {
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

export class DefaultSettingsHeaderWidget extends Widget {

	public domNode: HTMLElement;

	private headerContainer: HTMLElement;
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
		this.headerContainer = DOM.append(this.domNode, DOM.$('div.settings-header-container'));
		const titleContainer = DOM.append(this.headerContainer, DOM.$('div.settings-title-container'));
		this.createInfoContainer(DOM.append(titleContainer, DOM.$('div.settings-info-container')));
		this.createSearchContainer(DOM.append(this.headerContainer, DOM.$('div.settings-search-container')));
	}

	private createInfoContainer(infoContainer: HTMLElement) {
		DOM.append(infoContainer, DOM.$('span')).textContent = localize('defaultSettingsInfo', "Overwrite settings by placing them into your settings file.");
	}

	private createSearchContainer(searchContainer: HTMLElement) {
		this.searchContainer = searchContainer;
		const searchInput = DOM.append(this.searchContainer, DOM.$('div.settings-search-input'));
		this.inputBox = this._register(new InputBox(searchInput, this.contextViewService, {
			ariaLabel: localize('SearchSettingsWidget.AriaLabel', "Search default settings"),
			placeholder: localize('SearchSettingsWidget.Placeholder', "Search Default Settings")
		}));
		this.inputBox.width = 280;
		this.inputBox.onDidChange(value => this._onDidChange.fire(value));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp(e));
		this.searchContainer.style.display = 'none';
	}

	public show() {
		DOM.addClass(this.domNode, 'show');
	}

	public hide() {
		DOM.removeClass(this.domNode, 'show');
	}

	public focusTracker(): DOM.IFocusTracker {
		return DOM.trackFocus(this.inputBox.inputElement);
	}

	public focus() {
		this.inputBox.focus();
	}

	public layout(editorLayoutInfo: editorCommon.EditorLayoutInfo): void {
		this.headerContainer.style.width = editorLayoutInfo.width - editorLayoutInfo.verticalScrollbarWidth + 'px';
		this.headerContainer.style.paddingLeft = editorLayoutInfo.contentLeft + 'px';
		this.searchContainer.style.width = editorLayoutInfo.contentWidth - editorLayoutInfo.glyphMarginWidth + 'px';
		this.inputBox.width = editorLayoutInfo.contentWidth - editorLayoutInfo.glyphMarginWidth;
		this.searchContainer.style.display = 'inherit';
	}

	private _onKeyUp(keyboardEvent: IKeyboardEvent): void {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this._onEnter.fire();
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				return;
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

export class SettingsCountWidget extends Widget implements IOverlayWidget {

	private _domNode: HTMLElement;

	constructor(private editor: ICodeEditor, private total: number
	) {
		super();
	}

	public render() {
		this._domNode = DOM.$('.settings-count-widget');
		this.editor.addOverlayWidget(this);
	}

	public show(count: number) {
		if (count === this.total) {
			DOM.removeClass(this._domNode, 'show');
		} else {
			if (count === 0) {
				this._domNode.textContent = localize('noSettings', "No settings found");
				DOM.addClass(this._domNode, 'no-results');
			} else {
				this._domNode.textContent = localize('showCount', "Showing {0} of {1} Settings", count, this.total);
				DOM.removeClass(this._domNode, 'no-results');
			}
			DOM.addClass(this._domNode, 'show');
		}
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return 'editor.overlayWidget.settingsCountWidget';
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}
}