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
import Event, {Emitter} from 'vs/base/common/event';
import { ICommonCodeEditor, ICursorSelectionChangedEvent } from 'vs/editor/common/editorCommon';
import { IKeybindingContextKey, IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Context, provideSignatureHelp } from '../common/parameterHints';

const $ = dom.emmet;

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

	constructor(editor:ICommonCodeEditor) {
		super();

		this.editor = editor;
		this.enabled = false;
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new RunOnceScheduler(() => this.doTrigger(), ParameterHintsModel.DELAY);

		this.active = false;

		this._register(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelMode(_ => this.onModelChanged()));
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
				if (!result || result.signatures.length === 0) {
					this.cancel();
					this._onCancel.fire(void 0);
					return false;
				}

				this.active = true;

				const event:IHintEvent = { hints: result };
				this._onHint.fire(event);
				return true;
			});
	}

	isTriggered():boolean {
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

		const support = SignatureHelpProviderRegistry.ordered(model)[0];
		if (!support) {
			return;
		}

		this.triggerCharactersListeners = support.signatureHelpTriggerCharacters.map((ch) => {
			return this.editor.addTypingListener(ch, () => {
				this.trigger();
			});
		});
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

interface ISignatureView {
	top: number;
	height: number;
}

export class ParameterHintsWidget implements IContentWidget, IDisposable {

	static ID = 'editor.widget.parameterHintsWidget';

	private model: ParameterHintsModel;
	private keyVisible: IKeybindingContextKey<boolean>;
	private keyMultipleSignatures: IKeybindingContextKey<boolean>;
	private element: HTMLElement;
	private signatures: HTMLElement;
	private overloads: HTMLElement;
	private signatureViews: ISignatureView[];
	private currentSignature: number;
	private visible: boolean;
	private parameterHints: SignatureHelp;
	private announcedLabel: string;
	private disposables: IDisposable[];

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = true;

	constructor(private editor: ICodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		this.model = new ParameterHintsModel(editor);
		this.keyVisible = keybindingService.createKey(Context.Visible, false);
		this.keyMultipleSignatures = keybindingService.createKey(Context.MultipleSignatures, false);
		this.visible = false;
		this.disposables = [];

		this.disposables.push(this.model.onHint((e:IHintEvent) => {
			this.show();
			this.parameterHints = e.hints;
			this.render(e.hints);
			this.currentSignature = e.hints.activeSignature;
			this.select(this.currentSignature);
		}));

		this.disposables.push(this.model.onCancel(() => {
			this.hide();
		}));

		this.element = $('.editor-widget.parameter-hints-widget');

		this.disposables.push(dom.addDisposableListener(this.element, 'click', () => {
			this.next();
			this.editor.focus();
		}));

		const wrapper = dom.append(this.element, $('.wrapper.monaco-editor-background'));
		const buttons = dom.append(wrapper, $('.buttons'));
		const previous = dom.append(buttons, $('.button.previous'));
		const next = dom.append(buttons, $('.button.next'));

		this.disposables.push(dom.addDisposableListener(previous, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.previous();
		}));

		this.disposables.push(dom.addDisposableListener(next, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.next();
		}));

		this.overloads = dom.append(wrapper, $('.overloads'));
		this.signatures = dom.append(wrapper, $('.signatures'));

		this.signatureViews = [];
		this.currentSignature = 0;

		this.editor.addContentWidget(this);
		this.hide();

		this.disposables.push(this.editor.onDidChangeCursorSelection(e => {
			if (this.visible) {
				this.editor.layoutContentWidget(this);
			}
		}));
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
		this.parameterHints = null;
		this.announcedLabel = null;
		dom.removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	getPosition():IContentWidgetPosition {
		if (this.visible) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(hints:SignatureHelp): void {
		if (hints.signatures.length > 1) {
			dom.addClass(this.element, 'multiple');
		} else {
			dom.removeClass(this.element, 'multiple');
		}

		this.signatures.innerHTML = '';
		this.signatureViews = [];
		let height = 0;

		for (let i = 0, len = hints.signatures.length; i < len; i++) {
			const signature = hints.signatures[i];
			const signatureElement = this.renderSignature(this.signatures, signature, hints.activeParameter);

			this.renderDocumentation(signatureElement, signature, hints.activeParameter);

			const signatureHeight = dom.getContentHeight(signatureElement);

			this.signatureViews.push({
				top: height,
				height: signatureHeight
			});

			height += signatureHeight;
		}

		this.keyMultipleSignatures.set(this.signatureViews.length > 1);
	}

	private applyFont(element: HTMLElement): void {
		const fontInfo = this.editor.getConfiguration().fontInfo;
		element.style.fontFamily = fontInfo.fontFamily;
	}

	private renderSignature(element: HTMLElement, signature:SignatureInformation, currentParameter:number): HTMLElement {
		const signatureElement = dom.append(element, $('.signature'));
		const code = dom.append(signatureElement, $('.code'));
		const hasParameters = signature.parameters.length > 0;

		this.applyFont(code);

		if(!hasParameters) {
			const label = dom.append(code, $('span'));
			label.textContent = signature.label;
			return code;
		}

		const parameters = $('span.parameters');
		let offset = 0;
		let idx = 0;

		for (let i = 0, len = signature.parameters.length; i < len; i++) {
			const parameter = signature.parameters[i];
			idx = signature.label.indexOf(parameter.label, idx);

			let signatureLabelOffset = 0;
			let signatureLabelEnd = 0;

			if (idx >= 0) {
				signatureLabelOffset = idx;
				idx += parameter.label.length;
				signatureLabelEnd = idx;
			}

			const element = i === 0 ? code : parameters;

			const label = $('span');
			label.textContent = signature.label.substring(offset, signatureLabelOffset);
			dom.append(element, label);

			const parameterElement = $('span.parameter');
			dom.addClass(parameterElement, i === currentParameter ? 'active' : '');
			parameterElement.textContent = signature.label.substring(signatureLabelOffset, signatureLabelEnd);
			dom.append(parameters, parameterElement);

			offset = signatureLabelEnd;
		}

		const label = $('span');
		label.textContent = signature.label.substring(offset);

		dom.append(code, parameters);
		dom.append(code, label);

		return signatureElement;
	}

	private renderDocumentation(element: HTMLElement, signature:SignatureInformation, activeParameterIdx:number): void {
		if(signature.documentation) {
			const documentation = $('.documentation');
			documentation.textContent = signature.documentation;
			dom.append(element, documentation);
		}

		const activeParameter = signature.parameters[activeParameterIdx];

		if(activeParameter && activeParameter.documentation) {
			const parameter = $('.documentation-parameter');
			const label = $('span.parameter');
			this.applyFont(label);
			label.textContent = activeParameter.label;

			const documentation = $('span.documentation');
			documentation.textContent = activeParameter.documentation;

			dom.append(parameter, label);
			dom.append(parameter, documentation);
			dom.append(element, parameter);
		}
	}

	private select(position: number): void {
		const signature = this.signatureViews[position];

		if (!signature) {
			return;
		}

		this.signatures.style.height = `${ signature.height }px`;
		this.signatures.scrollTop = signature.top;

		let overloads = '' + (position + 1);

		if (this.signatureViews.length < 10) {
			overloads += '/' + this.signatureViews.length;
		}

		this.overloads.textContent = overloads;

		if (this.parameterHints && this.parameterHints.signatures[position].parameters[this.parameterHints.activeParameter]) {
			const labelToAnnounce = this.parameterHints.signatures[position].parameters[this.parameterHints.activeParameter].label;
			// Select method gets called on every user type while parameter hints are visible.
			// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.
			if (this.announcedLabel !== labelToAnnounce) {
				aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
				this.announcedLabel = labelToAnnounce;
			}
		}

		this.editor.layoutContentWidget(this);
	}

	next(): boolean {
		if (this.signatureViews.length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature = (this.currentSignature + 1) % this.signatureViews.length;
		this.select(this.currentSignature);
		return true;
	}

	previous(): boolean {
		if (this.signatureViews.length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature--;

		if (this.currentSignature < 0) {
			this.currentSignature = this.signatureViews.length - 1;
		}

		this.select(this.currentSignature);
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.model = null;
	}
}