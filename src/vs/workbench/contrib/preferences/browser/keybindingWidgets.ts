/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindings';
import * as nls from 'vs/nls';
import { OS } from 'vs/base/common/platform';
import { Disposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { asCssVariable, editorWidgetBackground, editorWidgetForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { SearchWidget, SearchOptions } from 'vs/workbench/contrib/preferences/browser/preferencesWidgets';
import { Promises, timeout } from 'vs/base/common/async';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { defaultInputBoxStyles, defaultKeybindingLabelStyles } from 'vs/platform/theme/browser/defaultStyles';

export interface KeybindingsSearchOptions extends SearchOptions {
	recordEnter?: boolean;
	quoteRecordedKeys?: boolean;
}

export class KeybindingsSearchWidget extends SearchWidget {

	private _chords: ResolvedKeybinding[] | null;
	private _inputValue: string;

	private readonly recordDisposables = this._register(new DisposableStore());

	private _onKeybinding = this._register(new Emitter<ResolvedKeybinding[] | null>());
	readonly onKeybinding: Event<ResolvedKeybinding[] | null> = this._onKeybinding.event;

	private _onEnter = this._register(new Emitter<void>());
	readonly onEnter: Event<void> = this._onEnter.event;

	private _onEscape = this._register(new Emitter<void>());
	readonly onEscape: Event<void> = this._onEscape.event;

	private _onBlur = this._register(new Emitter<void>());
	readonly onBlur: Event<void> = this._onBlur.event;

	constructor(parent: HTMLElement, options: KeybindingsSearchOptions,
		@IContextViewService contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(parent, options, contextViewService, instantiationService, contextKeyService, keybindingService);

		this._register(toDisposable(() => this.stopRecordingKeys()));

		this._chords = null;
		this._inputValue = '';
	}

	override clear(): void {
		this._chords = null;
		super.clear();
	}

	startRecordingKeys(): void {
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => this._onKeyDown(new StandardKeyboardEvent(e))));
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.BLUR, () => this._onBlur.fire()));
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.INPUT, () => {
			// Prevent other characters from showing up
			this.setInputValue(this._inputValue);
		}));
	}

	stopRecordingKeys(): void {
		this._chords = null;
		this.recordDisposables.clear();
	}

	setInputValue(value: string): void {
		this._inputValue = value;
		this.inputBox.value = this._inputValue;
	}

	private _onKeyDown(keyboardEvent: IKeyboardEvent): void {
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		const options = this.options as KeybindingsSearchOptions;
		if (!options.recordEnter && keyboardEvent.equals(KeyCode.Enter)) {
			this._onEnter.fire();
			return;
		}
		if (keyboardEvent.equals(KeyCode.Escape)) {
			this._onEscape.fire();
			return;
		}
		this.printKeybinding(keyboardEvent);
	}

	private printKeybinding(keyboardEvent: IKeyboardEvent): void {
		const keybinding = this.keybindingService.resolveKeyboardEvent(keyboardEvent);
		const info = `code: ${keyboardEvent.browserEvent.code}, keyCode: ${keyboardEvent.browserEvent.keyCode}, key: ${keyboardEvent.browserEvent.key} => UI: ${keybinding.getAriaLabel()}, user settings: ${keybinding.getUserSettingsLabel()}, dispatch: ${keybinding.getDispatchChords()[0]}`;
		const options = this.options as KeybindingsSearchOptions;

		if (!this._chords) {
			this._chords = [];
		}

		// TODO: note that we allow a keybinding "shift shift", but this widget doesn't allow input "shift shift" because the first "shift" will be incomplete - this is _not_ a regression
		const hasIncompleteChord = this._chords.length > 0 && this._chords[this._chords.length - 1].getDispatchChords()[0] === null;
		if (hasIncompleteChord) {
			this._chords[this._chords.length - 1] = keybinding;
		} else {
			if (this._chords.length === 2) { // TODO: limit chords # to 2 for now
				this._chords = [];
			}
			this._chords.push(keybinding);
		}

		const value = this._chords.map((keybinding) => keybinding.getUserSettingsLabel() || '').join(' ');
		this.setInputValue(options.quoteRecordedKeys ? `"${value}"` : value);

		this.inputBox.inputElement.title = info;
		this._onKeybinding.fire(this._chords);
	}
}

export class DefineKeybindingWidget extends Widget {

	private static readonly WIDTH = 400;
	private static readonly HEIGHT = 110;

	private _domNode: FastDomNode<HTMLElement>;
	private _keybindingInputWidget: KeybindingsSearchWidget;
	private _outputNode: HTMLElement;
	private _showExistingKeybindingsNode: HTMLElement;
	private _keybindingDisposables = this._register(new DisposableStore());

	private _chords: ResolvedKeybinding[] | null = null;
	private _isVisible: boolean = false;

	private _onHide = this._register(new Emitter<void>());

	private _onDidChange = this._register(new Emitter<string>());
	onDidChange: Event<string> = this._onDidChange.event;

	private _onShowExistingKeybindings = this._register(new Emitter<string | null>());
	readonly onShowExistingKeybidings: Event<string | null> = this._onShowExistingKeybindings.event;

	constructor(
		parent: HTMLElement | null,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setDisplay('none');
		this._domNode.setClassName('defineKeybindingWidget');
		this._domNode.setWidth(DefineKeybindingWidget.WIDTH);
		this._domNode.setHeight(DefineKeybindingWidget.HEIGHT);

		const message = nls.localize('defineKeybinding.initial', "Press desired key combination and then press ENTER.");
		dom.append(this._domNode.domNode, dom.$('.message', undefined, message));

		this._domNode.domNode.style.backgroundColor = asCssVariable(editorWidgetBackground);
		this._domNode.domNode.style.color = asCssVariable(editorWidgetForeground);
		this._domNode.domNode.style.boxShadow = `0 2px 8px ${asCssVariable(widgetShadow)}`;

		this._keybindingInputWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, this._domNode.domNode, { ariaLabel: message, history: [], inputBoxStyles: defaultInputBoxStyles }));
		this._keybindingInputWidget.startRecordingKeys();
		this._register(this._keybindingInputWidget.onKeybinding(keybinding => this.onKeybinding(keybinding)));
		this._register(this._keybindingInputWidget.onEnter(() => this.hide()));
		this._register(this._keybindingInputWidget.onEscape(() => this.clearOrHide()));
		this._register(this._keybindingInputWidget.onBlur(() => this.onCancel()));

		this._outputNode = dom.append(this._domNode.domNode, dom.$('.output'));
		this._showExistingKeybindingsNode = dom.append(this._domNode.domNode, dom.$('.existing'));

		if (parent) {
			dom.append(parent, this._domNode.domNode);
		}
	}

	get domNode(): HTMLElement {
		return this._domNode.domNode;
	}

	define(): Promise<string | null> {
		this._keybindingInputWidget.clear();
		return Promises.withAsyncBody<string | null>(async (c) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');

				this._chords = null;
				this._keybindingInputWidget.setInputValue('');
				dom.clearNode(this._outputNode);
				dom.clearNode(this._showExistingKeybindingsNode);

				// Input is not getting focus without timeout in safari
				// https://github.com/microsoft/vscode/issues/108817
				await timeout(0);

				this._keybindingInputWidget.focus();
			}
			const disposable = this._onHide.event(() => {
				c(this.getUserSettingsLabel());
				disposable.dispose();
			});
		});
	}

	layout(layout: dom.Dimension): void {
		const top = Math.round((layout.height - DefineKeybindingWidget.HEIGHT) / 2);
		this._domNode.setTop(top);

		const left = Math.round((layout.width - DefineKeybindingWidget.WIDTH) / 2);
		this._domNode.setLeft(left);
	}

	printExisting(numberOfExisting: number): void {
		if (numberOfExisting > 0) {
			const existingElement = dom.$('span.existingText');
			const text = numberOfExisting === 1 ? nls.localize('defineKeybinding.oneExists', "1 existing command has this keybinding", numberOfExisting) : nls.localize('defineKeybinding.existing', "{0} existing commands have this keybinding", numberOfExisting);
			dom.append(existingElement, document.createTextNode(text));
			aria.alert(text);
			this._showExistingKeybindingsNode.appendChild(existingElement);
			existingElement.onmousedown = (e) => { e.preventDefault(); };
			existingElement.onmouseup = (e) => { e.preventDefault(); };
			existingElement.onclick = () => { this._onShowExistingKeybindings.fire(this.getUserSettingsLabel()); };
		}
	}

	private onKeybinding(keybinding: ResolvedKeybinding[] | null): void {
		this._keybindingDisposables.clear();
		this._chords = keybinding;
		dom.clearNode(this._outputNode);
		dom.clearNode(this._showExistingKeybindingsNode);

		const firstLabel = this._keybindingDisposables.add(new KeybindingLabel(this._outputNode, OS, defaultKeybindingLabelStyles));
		firstLabel.set(this._chords?.[0] ?? undefined);

		if (this._chords) {
			for (let i = 1; i < this._chords.length; i++) {
				this._outputNode.appendChild(document.createTextNode(nls.localize('defineKeybinding.chordsTo', "chord to")));
				const chordLabel = this._keybindingDisposables.add(new KeybindingLabel(this._outputNode, OS, defaultKeybindingLabelStyles));
				chordLabel.set(this._chords[i]);
			}
		}

		const label = this.getUserSettingsLabel();
		if (label) {
			this._onDidChange.fire(label);
		}
	}

	private getUserSettingsLabel(): string | null {
		let label: string | null = null;
		if (this._chords) {
			label = this._chords.map(keybinding => keybinding.getUserSettingsLabel()).join(' ');
		}
		return label;
	}

	private onCancel(): void {
		this._chords = null;
		this.hide();
	}

	private clearOrHide(): void {
		if (this._chords === null) {
			this.hide();
		} else {
			this._chords = null;
			this._keybindingInputWidget.clear();
			dom.clearNode(this._outputNode);
			dom.clearNode(this._showExistingKeybindingsNode);
		}
	}

	private hide(): void {
		this._domNode.setDisplay('none');
		this._isVisible = false;
		this._onHide.fire();
	}
}

export class DefineKeybindingOverlayWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.defineKeybindingWidget';

	private readonly _widget: DefineKeybindingWidget;

	constructor(private _editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._widget = this._register(instantiationService.createInstance(DefineKeybindingWidget, null));
		this._editor.addOverlayWidget(this);
	}

	getId(): string {
		return DefineKeybindingOverlayWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._widget.domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	override dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	start(): Promise<string | null> {
		if (this._editor.hasModel()) {
			this._editor.revealPositionInCenterIfOutsideViewport(this._editor.getPosition(), ScrollType.Smooth);
		}
		const layoutInfo = this._editor.getLayoutInfo();
		this._widget.layout(new dom.Dimension(layoutInfo.width, layoutInfo.height));
		return this._widget.define();
	}
}
