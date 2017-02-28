/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./parameterHints';
import nls = require('vs/nls');
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import aria = require('vs/base/browser/ui/aria/aria');
import { SignatureHelp, SignatureInformation, SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { ICommonCodeEditor, ICursorSelectionChangedEvent, IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context, provideSignatureHelp } from '../common/parameterHints';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';

const $ = dom.$;

export interface IHintEvent {
	hints: SignatureHelp;
}

export class ParameterHintsModel extends Disposable {

	static DELAY = 120; // ms

	private _onHint = this._register(new Emitter<IHintEvent>());
	onHint: Event<IHintEvent> = this._onHint.event;

	private _onCancel = this._register(new Emitter<void>());
	onCancel: Event<void> = this._onCancel.event;

	private editor: ICommonCodeEditor;
	private enabled: boolean;
	private triggerCharactersListeners: IDisposable[];
	private active: boolean;
	private throttledDelayer: RunOnceScheduler;

	constructor(editor: ICommonCodeEditor) {
		super();

		this.editor = editor;
		this.enabled = false;
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new RunOnceScheduler(() => this.doTrigger(), ParameterHintsModel.DELAY);

		this.active = false;

		this._register(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelLanguage(_ => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this._register(SignatureHelpProviderRegistry.onDidChange(this.onModelChanged, this));

		this.onEditorConfigurationChange();
		this.onModelChanged();
	}

	cancel(silent: boolean = false): void {
		this.active = false;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onCancel.fire(void 0);
		}
	}

	trigger(delay = ParameterHintsModel.DELAY): void {
		if (!this.enabled || !SignatureHelpProviderRegistry.has(this.editor.getModel())) {
			return;
		}

		this.cancel(true);
		return this.throttledDelayer.schedule(delay);
	}

	private doTrigger(): void {
		provideSignatureHelp(this.editor.getModel(), this.editor.getPosition())
			.then<SignatureHelp>(null, onUnexpectedError)
			.then(result => {
				if (!result || !result.signatures || result.signatures.length === 0) {
					this.cancel();
					this._onCancel.fire(void 0);
					return false;
				}

				this.active = true;

				const event: IHintEvent = { hints: result };
				this._onHint.fire(event);
				return true;
			});
	}

	isTriggered(): boolean {
		return this.active || this.throttledDelayer.isScheduled();
	}

	private onModelChanged(): void {
		if (this.active) {
			this.cancel();
		}
		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const triggerChars = new CharacterSet();
		for (const support of SignatureHelpProviderRegistry.ordered(model)) {
			if (Array.isArray(support.signatureHelpTriggerCharacters)) {
				for (const ch of support.signatureHelpTriggerCharacters) {
					triggerChars.add(ch.charCodeAt(0));
				}
			}
		}

		this.triggerCharactersListeners.push(this.editor.onDidType((text: string) => {
			let lastCharCode = text.charCodeAt(text.length - 1);
			if (triggerChars.has(lastCharCode)) {
				this.trigger();
			}
		}));
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (e.source === 'mouse') {
			this.cancel();
		} else if (this.isTriggered()) {
			this.trigger();
		}
	}

	private onEditorConfigurationChange(): void {
		this.enabled = this.editor.getConfiguration().contribInfo.parameterHints;

		if (!this.enabled) {
			this.cancel();
		}
	}

	dispose(): void {
		this.cancel(true);
		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		super.dispose();
	}
}

export class ParameterHintsWidget implements IContentWidget, IDisposable {

	private static ID = 'editor.widget.parameterHintsWidget';

	private model: ParameterHintsModel;
	private keyVisible: IContextKey<boolean>;
	private keyMultipleSignatures: IContextKey<boolean>;
	private element: HTMLElement;
	private signature: HTMLElement;
	private docs: HTMLElement;
	private overloads: HTMLElement;
	private currentSignature: number;
	private visible: boolean;
	private hints: SignatureHelp;
	private announcedLabel: string;
	private scrollbar: DomScrollableElement;
	private disposables: IDisposable[];

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = true;

	constructor(private editor: ICodeEditor, @IContextKeyService contextKeyService: IContextKeyService) {
		this.model = new ParameterHintsModel(editor);
		this.keyVisible = Context.Visible.bindTo(contextKeyService);
		this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
		this.visible = false;
		this.disposables = [];

		this.disposables.push(this.model.onHint(e => {
			this.show();
			this.hints = e.hints;
			this.currentSignature = e.hints.activeSignature;
			this.render();
		}));

		this.disposables.push(this.model.onCancel(() => {
			this.hide();
		}));

		this.element = $('.editor-widget.parameter-hints-widget');
		const wrapper = dom.append(this.element, $('.wrapper'));

		const onClick = stop(domEvent(this.element, 'click'));
		onClick(this.next, this, this.disposables);

		const buttons = dom.append(wrapper, $('.buttons'));
		const previous = dom.append(buttons, $('.button.previous'));
		const next = dom.append(buttons, $('.button.next'));

		const onPreviousClick = stop(domEvent(previous, 'click'));
		onPreviousClick(this.previous, this, this.disposables);

		const onNextClick = stop(domEvent(next, 'click'));
		onNextClick(this.next, this, this.disposables);

		this.overloads = dom.append(wrapper, $('.overloads'));

		const body = $('.body');
		this.scrollbar = new DomScrollableElement(body, { canUseTranslate3d: false });
		this.disposables.push(this.scrollbar);
		wrapper.appendChild(this.scrollbar.getDomNode());

		this.signature = dom.append(body, $('.signature'));

		this.docs = dom.append(body, $('.docs'));

		this.currentSignature = 0;

		this.editor.addContentWidget(this);
		this.hide();

		this.disposables.push(this.editor.onDidChangeCursorSelection(e => {
			if (this.visible) {
				this.editor.layoutContentWidget(this);
			}
		}));

		const updateFont = () => {
			const fontInfo = this.editor.getConfiguration().fontInfo;
			this.element.style.fontSize = `${fontInfo.fontSize}px`;
		};

		updateFont();

		chain<IConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
			.filter(e => e.fontInfo)
			.on(updateFont, null, this.disposables);

		this.disposables.push(this.editor.onDidLayoutChange(e => this.updateMaxHeight()));
		this.updateMaxHeight();
	}

	private show(): void {
		if (!this.model || this.visible) {
			return;
		}

		this.keyVisible.set(true);
		this.visible = true;
		TPromise.timeout(100).done(() => dom.addClass(this.element, 'visible'));
		this.editor.layoutContentWidget(this);
	}

	private hide(): void {
		if (!this.model || !this.visible) {
			return;
		}

		this.keyVisible.reset();
		this.visible = false;
		this.hints = null;
		this.announcedLabel = null;
		dom.removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition {
		if (this.visible) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(): void {
		const multiple = this.hints.signatures.length > 1;
		dom.toggleClass(this.element, 'multiple', multiple);
		this.keyMultipleSignatures.set(multiple);

		this.signature.innerHTML = '';
		this.docs.innerHTML = '';

		const signature = this.hints.signatures[this.currentSignature];

		if (!signature) {
			return;
		}

		const code = dom.append(this.signature, $('.code'));
		const hasParameters = signature.parameters.length > 0;

		const fontInfo = this.editor.getConfiguration().fontInfo;
		code.style.fontSize = `${fontInfo.fontSize}px`;
		code.style.fontFamily = fontInfo.fontFamily;

		if (!hasParameters) {
			const label = dom.append(code, $('span'));
			label.textContent = signature.label;

		} else {
			this.renderParameters(code, signature, this.hints.activeParameter);
		}

		const activeParameter = signature.parameters[this.hints.activeParameter];

		if (activeParameter && activeParameter.documentation) {
			const documentation = $('span.documentation');
			documentation.textContent = activeParameter.documentation;
			dom.append(this.docs, $('p', null, documentation));
		}

		dom.toggleClass(this.signature, 'has-docs', !!signature.documentation);

		if (signature.documentation) {
			dom.append(this.docs, $('p', null, signature.documentation));
		}

		let currentOverload = String(this.currentSignature + 1);

		if (this.hints.signatures.length < 10) {
			currentOverload += `/${this.hints.signatures.length}`;
		}

		this.overloads.textContent = currentOverload;

		if (activeParameter) {
			const labelToAnnounce = activeParameter.label;
			// Select method gets called on every user type while parameter hints are visible.
			// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.

			if (this.announcedLabel !== labelToAnnounce) {
				aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
				this.announcedLabel = labelToAnnounce;
			}
		}

		this.editor.layoutContentWidget(this);
		this.scrollbar.scanDomNode();
	}

	private renderParameters(parent: HTMLElement, signature: SignatureInformation, currentParameter: number): void {
		let end = signature.label.length;
		let idx = 0;
		let element: HTMLSpanElement;

		for (let i = signature.parameters.length - 1; i >= 0; i--) {
			const parameter = signature.parameters[i];
			idx = signature.label.lastIndexOf(parameter.label, end - 1);

			let signatureLabelOffset = 0;
			let signatureLabelEnd = 0;

			if (idx >= 0) {
				signatureLabelOffset = idx;
				signatureLabelEnd = idx + parameter.label.length;
			}

			// non parameter part
			element = document.createElement('span');
			element.textContent = signature.label.substring(signatureLabelEnd, end);
			dom.prepend(parent, element);

			// parameter part
			element = document.createElement('span');
			element.className = `parameter ${i === currentParameter ? 'active' : ''}`;
			element.textContent = signature.label.substring(signatureLabelOffset, signatureLabelEnd);
			dom.prepend(parent, element);

			end = signatureLabelOffset;
		}
		// non parameter part
		element = document.createElement('span');
		element.textContent = signature.label.substring(0, end);
		dom.prepend(parent, element);
	}

	// private select(position: number): void {
	// 	const signature = this.signatureViews[position];

	// 	if (!signature) {
	// 		return;
	// 	}

	// 	this.signatures.style.height = `${ signature.height }px`;
	// 	this.signatures.scrollTop = signature.top;

	// 	let overloads = '' + (position + 1);

	// 	if (this.signatureViews.length < 10) {
	// 		overloads += '/' + this.signatureViews.length;
	// 	}

	// 	this.overloads.textContent = overloads;

	// 	if (this.hints && this.hints.signatures[position].parameters[this.hints.activeParameter]) {
	// 		const labelToAnnounce = this.hints.signatures[position].parameters[this.hints.activeParameter].label;
	// 		// Select method gets called on every user type while parameter hints are visible.
	// 		// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.
	// 		if (this.announcedLabel !== labelToAnnounce) {
	// 			aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
	// 			this.announcedLabel = labelToAnnounce;
	// 		}
	// 	}

	// 	this.editor.layoutContentWidget(this);
	// }

	next(): boolean {
		const length = this.hints.signatures.length;

		if (length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature = (this.currentSignature + 1) % length;
		this.render();
		return true;
	}

	previous(): boolean {
		const length = this.hints.signatures.length;

		if (length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature = (this.currentSignature - 1 + length) % length;
		this.render();
		return true;
	}

	cancel(): void {
		this.model.cancel();
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	getId(): string {
		return ParameterHintsWidget.ID;
	}

	trigger(): void {
		this.model.trigger(0);
	}

	private updateMaxHeight(): void {
		const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		this.element.style.maxHeight = `${height}px`;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.model = null;
	}
}