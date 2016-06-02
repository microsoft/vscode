/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./parameterHints';
import nls = require('vs/nls');
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import aria = require('vs/base/browser/ui/aria/aria');
import { ICursorSelectionChangedEvent, IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { SignatureHelp, SignatureInformation } from 'vs/editor/common/modes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IHintEvent, ParameterHintsModel } from './parameterHintsModel';

const $ = dom.emmet;

interface ISignatureView {
	top: number;
	height: number;
}

export class ParameterHintsWidget implements IContentWidget {

	static ID = 'editor.widget.parameterHintsWidget';

	private editor: ICodeEditor;
	private model: ParameterHintsModel;
	private element: HTMLElement;
	private signatures: HTMLElement;
	private overloads: HTMLElement;
	private signatureViews: ISignatureView[];
	private currentSignature: number;
	private visible: boolean;
	private parameterHints: SignatureHelp;
	private announcedLabel: string;
	private disposables: IDisposable[];

	private _onShown: () => void;
	private _onHidden: () => void;

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = true;

	constructor(model: ParameterHintsModel, editor: ICodeEditor, onShown: () => void, onHidden: () => void) {
		this._onShown = onShown;
		this._onHidden = onHidden;
		this.editor = editor;
		this.model = null;
		this.visible = false;
		this.model = model;

		this.disposables = [];

		this.disposables.push(this.model.onHint((e:IHintEvent) => {
			this.show();
			this.parameterHints = e.hints;
			this.render(e.hints);
			this.currentSignature = e.hints.activeSignature;
			this.select(this.currentSignature);
		}));

		this.disposables.push(this.model.onCancel(() => this.hide()));

		this.element = $('.editor-widget.parameter-hints-widget');

		this.disposables.push(dom.addDisposableListener(this.element, 'click', () => {
			this.selectNext();
			this.editor.focus();
		}));

		const wrapper = dom.append(this.element, $('.wrapper.monaco-editor-background'));
		const buttons = dom.append(wrapper, $('.buttons'));
		const previous = dom.append(buttons, $('.button.previous'));
		const next = dom.append(buttons, $('.button.next'));

		this.disposables.push(dom.addDisposableListener(previous, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.selectPrevious();
		}));

		this.disposables.push(dom.addDisposableListener(next, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.selectNext();
		}));

		this.overloads = dom.append(wrapper, $('.overloads'));
		this.signatures = dom.append(wrapper, $('.signatures'));

		this.signatureViews = [];
		this.currentSignature = 0;

		this.editor.addContentWidget(this);
		this.hide();

		this.disposables.push(this.editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {
			if (this.visible) {
				this.editor.layoutContentWidget(this);
			}
		}));

		this.editor.applyFontInfo(this.getDomNode());
		this.disposables.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.editor.applyFontInfo(this.getDomNode());
			}
		}));
	}

	private show(): void {
		if (!this.model || this.visible) {
			return;
		}

		this._onShown();
		this.visible = true;
		TPromise.timeout(100).done(() => dom.addClass(this.element, 'visible'));
		this.editor.layoutContentWidget(this);
	}

	private hide(): void {
		if (!this.model || !this.visible) {
			return;
		}

		this._onHidden();
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
	}

	private renderSignature(element: HTMLElement, signature:SignatureInformation, currentParameter:number): HTMLElement {
		const signatureElement = dom.append(element, $('.signature'));
		const hasParameters = signature.parameters.length > 0;

		if(!hasParameters) {
			const label = dom.append(signatureElement, $('span'));
			label.textContent = signature.label;
			return signatureElement;
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

			const element = i === 0 ? signatureElement : parameters;

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

		dom.append(signatureElement, parameters);
		dom.append(signatureElement, label);

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
			const parameter = $('.documentation');
			const label = $('span.parameter');
			label.textContent = activeParameter.label;

			const documentation = $('span');
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

	selectNext(): boolean {
		if (this.signatureViews.length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature = (this.currentSignature + 1) % this.signatureViews.length;
		this.select(this.currentSignature);
		return true;
	}

	selectPrevious(): boolean {
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

	destroy(): void {
		this.disposables = dispose(this.disposables);
		this.model = null;
	}
}