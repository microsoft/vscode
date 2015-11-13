/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./parameterHints';
import {TPromise} from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import Builder = require('vs/base/browser/builder');
import Model = require('./parameterHintsModel');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import EventEmitter = require('vs/base/common/eventEmitter');

var $ = Builder.$;

interface ISignatureView {
	top: number;
	height: number;
}

export class ParameterHintsWidget implements EditorBrowser.IContentWidget {

	static ID = 'editor.widget.parameterHintsWidget';

	private editor: EditorBrowser.ICodeEditor;
	private modelListenersToRemove: EventEmitter.ListenerUnbind[];
	private model: Model.ParameterHintsModel;
	private $el: Builder.Builder;
	private $wrapper: Builder.Builder;
	private $signatures: Builder.Builder;
	private $overloads: Builder.Builder;
	private signatureViews: ISignatureView[];
	private currentSignature: number;
	private isDisposed: boolean;
	private isVisible: boolean;
	private toDispose: lifecycle.IDisposable[];

	private _onShown: () => void;
	private _onHidden: () => void;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(model: Model.ParameterHintsModel, editor: EditorBrowser.ICodeEditor, onShown: () => void, onHidden: () => void) {
		this._onShown = onShown;
		this._onHidden = onHidden;
		this.editor = editor;
		this.modelListenersToRemove = [];
		this.model = null;
		this.isVisible = false;
		this.isDisposed = false;

		this.setModel(model);

		this.$el = $('.editor-widget.parameter-hints-widget').on('click', () => {
			this.selectNext();
			this.editor.focus();
		});

		this.$wrapper = $('.wrapper.monaco-editor-background').appendTo(this.$el);

		var $buttons = $('.buttons').appendTo(this.$wrapper);

		$('.button.previous').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.selectPrevious();
		}).appendTo($buttons);

		$('.button.next').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.selectNext();
		}).appendTo($buttons);

		this.$overloads = $('.overloads').appendTo(this.$wrapper);

		this.$signatures = $('.signatures').appendTo(this.$wrapper);

		this.signatureViews = [];
		this.currentSignature = 0;

		this.editor.addContentWidget(this);
		this.hide();

		this.toDispose = [];

		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.CursorSelectionChanged,(e: EditorCommon.ICursorSelectionChangedEvent) => {
			this.editor.layoutContentWidget(this);
		}));
	}

	private setModel(newModel: Model.ParameterHintsModel): void {
		this.releaseModel();
		this.model = newModel;

		this.modelListenersToRemove.push(this.model.addListener('hint', (e:Model.IHintEvent) => {
			this.show();
			this.render(e.hints);
			this.currentSignature = e.hints.currentSignature;
			this.select(this.currentSignature);
		}));

		this.modelListenersToRemove.push(this.model.addListener('cancel', (e) => {
			this.hide();
		}));
	}

	private show(): void {
		if (this.isDisposed) {
			return;
		}
		this._onShown();

		this.isVisible = true;
		TPromise.timeout(100).done(() => {
			this.$el.addClass('visible');
		});
		this.editor.layoutContentWidget(this);
	}

	private hide(): void {
		if (this.isDisposed) {
			return;
		}
		this._onHidden();

		this.isVisible = false;
		this.$el.removeClass('visible');
		this.editor.layoutContentWidget(this);
	}

	public getPosition():EditorBrowser.IContentWidgetPosition {
		if (this.isVisible) {
			return {
				position: this.editor.getPosition(),
				preference: [EditorBrowser.ContentWidgetPositionPreference.ABOVE, EditorBrowser.ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(hints:Modes.IParameterHints): void {
		if (hints.signatures.length > 1) {
			this.$el.addClass('multiple');
		} else {
			this.$el.removeClass('multiple');
		}

		this.$signatures.empty();
		this.signatureViews = [];
		var height = 0;

		for (var i = 0, len = hints.signatures.length; i < len; i++) {
			var signature = hints.signatures[i];
			var $signature = this.renderSignature(this.$signatures, signature, hints.currentParameter);

			this.renderDocumentation($signature, signature, hints.currentParameter);

			var signatureHeight = $signature.getClientArea().height;

			this.signatureViews.push({
				top: height,
				height: signatureHeight
			});

			height += signatureHeight;
		}
	}

	private renderSignature($el:Builder.Builder, signature:Modes.ISignature, currentParameter:number):Builder.Builder {

		var $signature = $('.signature').appendTo($el),
			hasParameters = signature.parameters.length > 0;

		if(!hasParameters) {
			$signature.append($('span').text(signature.label));

		} else {

			var $parameters = $('span.parameters'),
				offset = 0;

			for (var i = 0, len = signature.parameters.length; i < len; i++) {
				var parameter = signature.parameters[i];
				(i === 0 ? $signature : $parameters).append($('span').text(signature.label.substring(offset, parameter.signatureLabelOffset)));
				$parameters.append($('span.parameter').addClass(i === currentParameter ? 'active' : '').text(signature.label.substring(parameter.signatureLabelOffset, parameter.signatureLabelEnd)));
				offset = parameter.signatureLabelEnd;
			}

			$signature.append($parameters);
			$signature.append($('span').text(signature.label.substring(offset)));
		}

		return $signature;
	}

	private renderDocumentation($el:Builder.Builder, signature:Modes.ISignature, activeParameterIdx:number): void {

		if(signature.documentation) {
			$el.append($('.documentation').text(signature.documentation));
		}

		var activeParameter = signature.parameters[activeParameterIdx];
		if(activeParameter && activeParameter.documentation) {
			var $parameter = $('.documentation');
			$parameter.append($('span.parameter').text(activeParameter.label));
			$parameter.append($('span').text(activeParameter.documentation));
			$el.append($parameter);
		}
	}

	private select(position: number): void {
		var signature = this.signatureViews[position];

		if (!signature) {
			return;
		}

		this.$signatures.style({ height: signature.height + 'px' });
		this.$signatures.getHTMLElement().scrollTop = signature.top;

		var overloads = '' + (position + 1);

		if (this.signatureViews.length < 10) {
			overloads += '/' + this.signatureViews.length;
		}

		this.$overloads.text(overloads);
		this.editor.layoutContentWidget(this);
	}

	public selectNext(): boolean {
		if (this.signatureViews.length < 2) {
			this.cancel();
			return false;
		}

		this.currentSignature = (this.currentSignature + 1) % this.signatureViews.length;
		this.select(this.currentSignature);
		return true;
	}

	public selectPrevious(): boolean {
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

	public cancel(): void {
		this.model.cancel();
	}

	public getDomNode(): HTMLElement {
		return this.$el.getHTMLElement();
	}

	public getId(): string {
		return ParameterHintsWidget.ID;
	}

	private releaseModel(): void {
		var listener:()=>void;
		while (listener = this.modelListenersToRemove.pop()) {
			listener();
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	public destroy(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		this.releaseModel();

		if (this.$overloads) {
			this.$overloads.destroy();
			delete this.$overloads;
		}

		if (this.$signatures) {
			this.$signatures.destroy();
			delete this.$signatures;
		}

		if (this.$wrapper) {
			this.$wrapper.destroy();
			delete this.$wrapper;
		}

		if (this.$el) {
			this.$el.destroy();
			delete this.$el;
		}

		this.isDisposed = true;
	}
}

