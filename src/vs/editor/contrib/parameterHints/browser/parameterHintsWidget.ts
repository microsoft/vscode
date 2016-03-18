/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./parameterHints';
import nls = require('vs/nls');
import {ListenerUnbind} from 'vs/base/common/eventEmitter';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, $} from 'vs/base/browser/builder';
import aria = require('vs/base/browser/ui/aria/aria');
import {EventType, ICursorSelectionChangedEvent} from 'vs/editor/common/editorCommon';
import {IParameterHints, ISignature} from 'vs/editor/common/modes';
import {ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition} from 'vs/editor/browser/editorBrowser';
import {IHintEvent, ParameterHintsModel} from './parameterHintsModel';

interface ISignatureView {
	top: number;
	height: number;
}

export class ParameterHintsWidget implements IContentWidget {

	static ID = 'editor.widget.parameterHintsWidget';

	private editor: ICodeEditor;
	private modelListenersToRemove: ListenerUnbind[];
	private model: ParameterHintsModel;
	private $el: Builder;
	private $wrapper: Builder;
	private $signatures: Builder;
	private $overloads: Builder;
	private signatureViews: ISignatureView[];
	private currentSignature: number;
	private isDisposed: boolean;
	private isVisible: boolean;
	private parameterHints: IParameterHints;
	private announcedLabel: string;
	private toDispose: IDisposable[];

	private _onShown: () => void;
	private _onHidden: () => void;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(model: ParameterHintsModel, editor: ICodeEditor, onShown: () => void, onHidden: () => void) {
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

		this.toDispose.push(this.editor.addListener2(EventType.CursorSelectionChanged,(e: ICursorSelectionChangedEvent) => {
			if (this.isVisible) {
				this.editor.layoutContentWidget(this);
			}
		}));
	}

	private setModel(newModel: ParameterHintsModel): void {
		this.releaseModel();
		this.model = newModel;

		this.modelListenersToRemove.push(this.model.addListener('hint', (e:IHintEvent) => {
			this.show();
			this.parameterHints = e.hints;
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
		if (this.isVisible) {
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
		if (!this.isVisible) {
			return;
		}
		this._onHidden();

		this.isVisible = false;
		this.parameterHints = null;
		this.announcedLabel = null;
		this.$el.removeClass('visible');
		this.editor.layoutContentWidget(this);
	}

	public getPosition():IContentWidgetPosition {
		if (this.isVisible) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(hints:IParameterHints): void {
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

	private renderSignature($el:Builder, signature:ISignature, currentParameter:number):Builder {

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

	private renderDocumentation($el:Builder, signature:ISignature, activeParameterIdx:number): void {

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
		if (this.parameterHints && this.parameterHints.signatures[position].parameters[this.parameterHints.currentParameter]) {
			const labelToAnnounce = this.parameterHints.signatures[position].parameters[this.parameterHints.currentParameter].label;
			// Select method gets called on every user type while parameter hints are visible.
			// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.
			if (this.announcedLabel !== labelToAnnounce) {
				aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
				this.announcedLabel = labelToAnnounce;
			}
		}
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
		this.toDispose = disposeAll(this.toDispose);
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

