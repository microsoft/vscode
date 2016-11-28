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
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ISettingsGroup } from 'vs/workbench/parts/preferences/common/preferences';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class SettingsGroupTitleWidget extends ZoneWidget {

	private titleWidgetContainer: HTMLElement;
	private titleContainer: HTMLElement;

	private _onToggled = this._register(new Emitter<boolean>());
	public onToggled: Event<boolean> = this._onToggled.event;

	constructor(editor: ICodeEditor, public settingsGroup: ISettingsGroup) {
		super(editor, {
			showFrame: false,
			showArrow: false
		});
		this.create();
		this._register(this.editor.onDidLayoutChange(() => this.layout()));
	}

	protected _fillContainer(container: HTMLElement) {
		this.titleWidgetContainer = DOM.append(container, DOM.$('.settings-group-title-widget-container'));
		this.titleContainer = DOM.append(this.titleWidgetContainer, DOM.$('.title-container'));
		this.onclick(this.titleContainer, () => this.onTitleClicked());
		const title = DOM.append(this.titleContainer, DOM.$('.title'));
		DOM.append(title, DOM.$('span')).textContent = this.settingsGroup.title + ` (${this.settingsGroup.sections.reduce((count, section) => count + section.settings.length, 0)})`;
		this.layout();
	}

	public render() {
		this.show({ lineNumber: this.settingsGroup.range.startLineNumber - 2, column: 0 }, 2);
	}

	public collapse() {
		DOM.addClass(this.titleContainer, 'collapsed');
	}

	private layout() {
		this.titleWidgetContainer.style.paddingLeft = '10px';
		const editorLayoutInfo = this.editor.getLayoutInfo();
		this.titleWidgetContainer.style.paddingLeft = editorLayoutInfo.contentLeft + 'px';
		this.titleContainer.style.fontSize = this.editor.getConfiguration().fontInfo.fontSize + 6 + 'px';
	}

	private onTitleClicked() {
		const isCollapsed = DOM.hasClass(this.titleContainer, 'collapsed');
		DOM.toggleClass(this.titleContainer, 'collapsed', !isCollapsed);
		this._onToggled.fire(!isCollapsed);
	}
}

class HeaderViewZone implements IViewZone {

	private _domNode: HTMLElement;
	public id: number;
	public heightInPx: number;

	public get domNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = DOM.$('.settings-header-view');
		}
		return this._domNode;
	}

	public get afterLineNumber(): number {
		return 0;
	}

	public get afterColumn(): number {
		return 0;
	}
}

export class DefaultSettingsHeaderWidget extends Widget implements IOverlayWidget {

	private domNode: HTMLElement;
	private headerViewZone: HeaderViewZone;
	protected headerContainer: HTMLElement;
	private searchContainer: HTMLElement;
	private inputBox: InputBox;

	private _onDidChange = this._register(new Emitter<string>());
	public onDidChange: Event<string> = this._onDidChange.event;

	private _onEnter = this._register(new Emitter<void>());
	public onEnter: Event<void> = this._onEnter.event;

	protected _onShowDefaults = this._register(new Emitter<void>());
	public onShowDefaults: Event<void> = this._onShowDefaults.event;

	private _onCopySetting = new Emitter<void>();
	public onCopySetting: Event<void> = this._onCopySetting.event;

	constructor(private editor: ICodeEditor,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this._register(this.editor.onDidChangeCursorPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
	}

	public getId(): string {
		return 'editor.overlay.defaultSettingsHeaderWidget';
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return null;
	}

	protected create() {
		this.domNode = DOM.$('div.settings-header-widget');
		this.headerContainer = DOM.append(this.domNode, DOM.$('div.settings-header-container'));
		const titleContainer = DOM.append(this.headerContainer, DOM.$('div.settings-title-container'));
		this.createInfoContainer(DOM.append(titleContainer, DOM.$('div.settings-info-container')));
		this.createSearchContainer(DOM.append(this.headerContainer, DOM.$('div.settings-search-container')));
	}

	protected createInfoContainer(infoContainer: HTMLElement) {
		DOM.append(infoContainer, DOM.$('span')).textContent = localize('defaultSettingsInfo', "Overwrite settings by placing them into your settings file.");
	}

	protected createSearchContainer(searchContainer: HTMLElement) {
		this.searchContainer = searchContainer;
		const searchInput = DOM.append(this.searchContainer, DOM.$('div.settings-search-input'));
		this.inputBox = this._register(new InputBox(searchInput, this.contextViewService, {
			ariaLabel: localize('SearchSettingsWidget.AriaLabel', "Search default settings"),
			placeholder: localize('SearchSettingsWidget.Placeholder', "Search Default Settings")
		}));
		this.inputBox.width = 280;
		this.inputBox.onDidChange(value => this._onDidChange.fire(value));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp(e));
	}

	public render(): void {
		this.create();
		this.headerViewZone = new HeaderViewZone();
		this.editor.changeViewZones(accessor => {
			this.headerViewZone.id = accessor.addZone(this.headerViewZone);
		});

		this.editor.addOverlayWidget(this);
		this._register(this.editor.onDidLayoutChange(e => this.layout()));
		this.layout();
	}

	public clearInput() {
		this.inputBox.value = '';
	}

	public setInput(value: string) {
		this.inputBox.value = value;
	}

	private layout(): void {
		const editorLayoutInfo = this.editor.getLayoutInfo();
		this.domNode.style.width = editorLayoutInfo.width - editorLayoutInfo.verticalScrollbarWidth + 'px';
		this.headerContainer.style.width = editorLayoutInfo.width - editorLayoutInfo.verticalScrollbarWidth + 'px';
		this.headerContainer.style.paddingLeft = editorLayoutInfo.contentLeft + 'px';
		this.headerContainer.style.paddingRight = editorLayoutInfo.glyphMarginWidth + 'px';
		this.searchContainer.style.width = editorLayoutInfo.contentWidth - editorLayoutInfo.glyphMarginWidth - 20 + 'px';
		this.inputBox.width = editorLayoutInfo.contentWidth - editorLayoutInfo.glyphMarginWidth - 20;

		this.headerViewZone.heightInPx = DOM.getDomNodePagePosition(this.domNode).height;
		this.editor.changeViewZones(accessor => {
			accessor.layoutZone(this.headerViewZone.id);
		});
	}

	private _onKeyUp(keyboardEvent: IKeyboardEvent): void {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				if (keyboardEvent.ctrlKey) {
					this._onCopySetting.fire();
				} else {
					this._onEnter.fire();
				}
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				return;
		}
	}

	private onPositionChanged(positionChangeEvent: editorCommon.ICursorPositionChangedEvent) {
		if (positionChangeEvent.position.lineNumber < 3) {
			this.editor.setScrollTop(0);
		}
	}

	public dispose() {
		this.editor.removeOverlayWidget(this);
		super.dispose();
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