/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./peekViewWidget';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as strings from 'vs/base/common/strings';
import { $ } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';
import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ServicesAccessor, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IOptions, ZoneWidget } from './zoneWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

export var IPeekViewService = createDecorator<IPeekViewService>('peekViewService');

export namespace PeekContext {
	export const inPeekEditor = new RawContextKey<boolean>('inReferenceSearchEditor', true);
	export const notInPeekEditor: ContextKeyExpr = inPeekEditor.toNegated();
}

export const NOT_INNER_EDITOR_CONTEXT_KEY = new RawContextKey<boolean>('inReferenceSearchEditor', true);

export interface IPeekViewService {
	_serviceBrand: any;
	isActive: boolean;
}

export function getOuterEditor(accessor: ServicesAccessor, args: any): ICommonCodeEditor {
	let editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}
	return editor;
}

export abstract class PeekViewWidget extends ZoneWidget implements IPeekViewService {

	public _serviceBrand: any;

	private _onDidClose = new Emitter<PeekViewWidget>();
	private _isActive = false;

	protected _headElement: HTMLDivElement;
	protected _primaryHeading: HTMLElement;
	protected _secondaryHeading: HTMLElement;
	protected _metaHeading: HTMLElement;
	protected _actionbarWidget: ActionBar;
	protected _bodyElement: HTMLDivElement;

	constructor(editor: ICodeEditor, options: IOptions = {}) {
		super(editor, options);
	}

	public dispose(): void {
		this._isActive = false;
		super.dispose();
		this._onDidClose.fire(this);
	}

	public get onDidClose(): Event<PeekViewWidget> {
		return this._onDidClose.event;
	}

	public get isActive(): boolean {
		return this._isActive;
	}

	public show(where: any, heightInLines: number): void {
		this._isActive = true;
		super.show(where, heightInLines);
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('peekview-widget');

		this._headElement = <HTMLDivElement>$('.head').getHTMLElement();
		this._bodyElement = <HTMLDivElement>$('.body').getHTMLElement();

		this._fillHead(this._headElement);
		this._fillBody(this._bodyElement);

		container.appendChild(this._headElement);
		container.appendChild(this._bodyElement);
	}

	protected _fillHead(container: HTMLElement): void {
		var titleElement = $('.peekview-title').
			on(dom.EventType.CLICK, e => this._onTitleClick(<MouseEvent>e)).
			appendTo(this._headElement).
			getHTMLElement();

		this._primaryHeading = $('span.filename').appendTo(titleElement).getHTMLElement();
		this._secondaryHeading = $('span.dirname').appendTo(titleElement).getHTMLElement();
		this._metaHeading = $('span.meta').appendTo(titleElement).getHTMLElement();

		this._actionbarWidget = new ActionBar(
			$('.peekview-actions').
				appendTo(this._headElement)
		);

		this._actionbarWidget.push(new Action('peekview.close', nls.localize('label.close', "Close"), 'close-peekview-action', true, () => {
			this.dispose();
			return null;
		}), { label: false, icon: true });
	}

	protected _onTitleClick(event: MouseEvent): void {
		// implement me
	}

	public setTitle(primaryHeading: string, secondaryHeading?: string): void {
		$(this._primaryHeading).safeInnerHtml(primaryHeading);
		if (secondaryHeading) {
			$(this._secondaryHeading).safeInnerHtml(secondaryHeading);
		} else {
			dom.clearNode(this._secondaryHeading);
		}
	}

	public setMetaTitle(value: string): void {
		if (value) {
			$(this._metaHeading).safeInnerHtml(value);
		} else {
			dom.clearNode(this._metaHeading);
		}
	}

	protected _fillBody(container: HTMLElement): void {
		// implement me
	}

	public _doLayout(heightInPixel: number, widthInPixel: number): void {

		if (!this._isShowing && heightInPixel < 0) {
			// Looks like the view zone got folded away!
			this.dispose();
			this._onDidClose.fire(this);
			return;
		}

		var headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2),
			bodyHeight = heightInPixel - (headHeight + 2 /* the border-top/bottom width*/);

		this._doLayoutHead(headHeight, widthInPixel);
		this._doLayoutBody(bodyHeight, widthInPixel);
	}

	protected _doLayoutHead(heightInPixel: number, widthInPixel: number): void {
		this._headElement.style.height = strings.format('{0}px', heightInPixel);
		this._headElement.style.lineHeight = this._headElement.style.height;
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		this._bodyElement.style.height = strings.format('{0}px', heightInPixel);
	}
}

// theming

export const editorPeekTitleBackground = registerColor('editorPeekTitleBackground', { dark: '#1E1E1E', light: '#FFFFFF', hc: '#0C141F' }, nls.localize('editorPeekTitleBackground', 'Editor peek title area background'));
export const editorPeekTitle = registerColor('editorPeekTitle', { dark: '#FFFFFF', light: '#333333', hc: '#FFFFFF' }, nls.localize('editorPeekTitle', 'Editor peek title color'));
export const editorPeekTitleInfo = registerColor('editorPeekTitleInfo', { dark: '#ccccccb3', light: '#6c6c6cb3', hc: '#FFFFFF99' }, nls.localize('editorPeekTitleInfo', 'Editor peek title info color'));
export const editorPeekBorders = registerColor('editorPeekBorder', { dark: '#007acc', light: '#007acc', hc: '#6FC3DF' }, nls.localize('editorPeekBorder', 'Editor peek view borders'));

registerThemingParticipant((theme, collector) => {
	let peekBackground = theme.getColor(editorPeekTitleBackground);
	if (peekBackground) {
		collector.addRule(`.monaco-editor.${theme.selector} .peekview-widget .head { background-color: ${peekBackground}; }`);
	}
	let title = theme.getColor(editorPeekTitle);
	if (title) {
		collector.addRule(`.monaco-editor.${theme.selector} .peekview-widget .head .peekview-title .filename { color: ${title}; }`);
	}
	let titleInfo = theme.getColor(editorPeekTitleInfo);
	if (titleInfo) {
		collector.addRule(`.monaco-editor.${theme.selector} .peekview-widget .head .peekview-title .dirname:not(:empty) { color: ${titleInfo}; }`);
	}
	let borders = theme.getColor(editorPeekBorders);
	if (borders) {
		collector.addRule(`.monaco-editor.${theme.selector} .zone-widget-container.peekview-widget { border-top-color: ${borders}; border-bottom-color: ${borders}; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .peekview-widget > .body { border-color: ${borders}; }`);
	}
});