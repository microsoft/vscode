/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./peekViewWidget';
import nls = require('vs/nls');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import actions = require('vs/base/common/actions');
import strings = require('vs/base/common/strings');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import zoneWidget = require('./zoneWidget');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {createDecorator, ServiceIdentifier, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';

export var IPeekViewService = createDecorator<IPeekViewService>('peekViewService');

export interface IPeekViewService {
	serviceId: ServiceIdentifier<any>;
	isActive:boolean;
	contextKey:string;
	getActiveWidget(): PeekViewWidget;
}

export namespace Events {
	export var Closed = 'closed';
}

var CONTEXT_OUTER_EDITOR = 'outerEditorId';

export function getOuterEditor(accessor:ServicesAccessor, args: any): EditorCommon.ICommonCodeEditor {
	var outerEditorId = args.context[CONTEXT_OUTER_EDITOR];
	if (!outerEditorId) {
		return null;
	}
	return accessor.get(ICodeEditorService).getCodeEditor(outerEditorId);
}

export class PeekViewWidget extends zoneWidget.ZoneWidget implements IPeekViewService {
	public serviceId = IPeekViewService;
	public contextKey:string;

	private _isActive:boolean;

	_headElement:HTMLDivElement;
	_primaryHeading:HTMLElement;
	_secondaryHeading:HTMLElement;
	_actionbarWidget:actionbar.ActionBar;
	_bodyElement:HTMLDivElement;

	constructor(editor: EditorBrowser.ICodeEditor, keybindingService:IKeybindingService, contextKey:string, options: zoneWidget.IOptions = {}) {
		super(editor, options);
		this.contextKey = contextKey;
		keybindingService.createKey(CONTEXT_OUTER_EDITOR, editor.getId());
	}

	public dispose(): void{
		this._isActive = false;
		super.dispose();
	}

	public get isActive():boolean {
		return this._isActive;
	}

	public getActiveWidget():PeekViewWidget {
		return this;
	}

	public show(where:any, heightInLines:number):void {
		this._isActive = true;
		super.show(where, heightInLines);
	}

	public fillContainer(container:HTMLElement):void {
		builder.$(container).addClass('peekview-widget');

		this._headElement = <HTMLDivElement> builder.$('.head').getHTMLElement();
		this._bodyElement = <HTMLDivElement> builder.$('.body').getHTMLElement();

		this._fillHead(this._headElement);
		this._fillBody(this._bodyElement);

		container.appendChild(this._headElement);
		container.appendChild(this._bodyElement);
	}

	_fillHead(container:HTMLElement):void {
		var titleElement = builder.$('.peekview-title').
			on(dom.EventType.CLICK, (e) => this._onTitleClick(e)).
			appendTo(this._headElement).
			getHTMLElement();

		this._primaryHeading = builder.$('span.filename').appendTo(titleElement).getHTMLElement();
		this._secondaryHeading = builder.$('span.dirname').appendTo(titleElement).getHTMLElement();

		this._actionbarWidget = new actionbar.ActionBar(
			builder.$('.peekview-actions').
			appendTo(this._headElement)
		);

		this._actionbarWidget.push(new actions.Action('peekview.close', nls.localize('label.close', "Close"), 'close-peekview-action', true, () => {
			this.dispose();
			this.emit(Events.Closed, this);
			return null;
		}), { label: false, icon: true });
	}

	_onTitleClick(event:Event):void {
		// implement me
	}

	public setTitle(primaryHeading:string, secondaryHeading?:string):void {
		builder.$(this._primaryHeading).safeInnerHtml(primaryHeading);
		if(secondaryHeading) {
			builder.$(this._secondaryHeading).safeInnerHtml(secondaryHeading);
		} else {
			dom.clearNode(this._secondaryHeading);
		}
	}

	_fillBody(container:HTMLElement):void {
		// implement me
	}

	public doLayout(heightInPixel:number):void {

		var headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2),
			bodyHeight = heightInPixel - (headHeight + 2 /* the border-top/bottom width*/);

		this._doLayoutHead(headHeight);
		this._doLayoutBody(bodyHeight);
	}

	_doLayoutHead(heightInPixel:number):void {
		this._headElement.style.height = strings.format('{0}px', heightInPixel);
		this._headElement.style.lineHeight = this._headElement.style.height;
	}

	_doLayoutBody(heightInPixel:number):void {
		this._bodyElement.style.height = strings.format('{0}px', heightInPixel);
	}
}