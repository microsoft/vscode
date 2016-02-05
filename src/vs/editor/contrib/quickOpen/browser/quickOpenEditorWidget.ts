/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import Builder = require('vs/base/browser/builder');
import QuickOpenWidget = require('vs/base/parts/quickopen/browser/quickOpenWidget');
import QuickOpenModel = require('vs/base/parts/quickopen/browser/quickOpenModel');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');

var $ = Builder.$;

export interface IQuickOpenEditorWidgetOptions {
	inputAriaLabel: string;
}

export class QuickOpenEditorWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.quickOpenEditorWidget';

	private codeEditor:EditorBrowser.ICodeEditor;
	private visible:boolean;
	private quickOpenWidget:QuickOpenWidget.QuickOpenWidget;
	private domNode:HTMLElement;

	constructor(codeEditor:EditorBrowser.ICodeEditor, onOk:()=>void, onCancel:()=>void, onType:(value:string)=>void, configuration:IQuickOpenEditorWidgetOptions) {
		this.codeEditor = codeEditor;

		this.create(onOk, onCancel, onType, configuration);
	}

	private create(onOk:()=>void, onCancel:()=>void, onType:(value:string)=>void, configuration:IQuickOpenEditorWidgetOptions):void {
		this.domNode = $().div().getHTMLElement();

		this.quickOpenWidget = new QuickOpenWidget.QuickOpenWidget(
			this.domNode,
			{
				onOk:onOk,
				onCancel:onCancel,
				onType:onType
			}, {
				inputPlaceHolder: null,
				inputAriaLabel: configuration.inputAriaLabel
			},
			null
		);

		this.quickOpenWidget.create();
		this.codeEditor.addOverlayWidget(this);
	}

	public setInput(model:QuickOpenModel.QuickOpenModel, focus:QuickOpen.IAutoFocus):void {
		this.quickOpenWidget.setInput(model, focus);
	}

	public getId(): string {
		return QuickOpenEditorWidget.ID;
	}

	public getDomNode():HTMLElement {
		return this.domNode;
	}

	public destroy():void {
		this.codeEditor.removeOverlayWidget(this);
		this.quickOpenWidget.dispose();
	}

	public isVisible():boolean {
		return this.visible;
	}

	public show(value:string):void {
		this.visible = true;

		var editorLayout = this.codeEditor.getLayoutInfo();
		if (editorLayout) {
			this.quickOpenWidget.layout(new Builder.Dimension(editorLayout.width, editorLayout.height));
		}

		this.quickOpenWidget.show(value);
		this.codeEditor.layoutOverlayWidget(this);
	}

	public hide():void {
		this.visible = false;
		this.quickOpenWidget.hide();
		this.codeEditor.layoutOverlayWidget(this);
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		if (this.visible) {
			return {
				preference: EditorBrowser.OverlayWidgetPositionPreference.TOP_CENTER
			};
		}

		return null;
	}
}