/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import QuickOpenEditorWidget = require('./quickOpenEditorWidget');
import QuickOpenWidget = require('vs/base/parts/quickopen/browser/quickOpenWidget');
import QuickOpenModel = require('vs/base/parts/quickopen/browser/quickOpenModel');
import QuickOpen = require('vs/base/parts/quickopen/browser/quickOpen');
import {INullService} from 'vs/platform/instantiation/common/instantiation';

export interface IQuickOpenControllerOpts {
	inputAriaLabel: string;
	getModel(value:string):QuickOpenModel.QuickOpenModel;
	getAutoFocus(searchValue:string):QuickOpen.IAutoFocus;
	onOk():void;
	onCancel():void;
}

export class QuickOpenController implements EditorCommon.IEditorContribution {

	static ID = 'editor.controller.quickOpenController';

	public static get(editor:EditorCommon.ICommonCodeEditor): QuickOpenController {
		return <QuickOpenController>editor.getContribution(QuickOpenController.ID);
	}

	private editor:EditorBrowser.ICodeEditor;
	private widget:QuickOpenEditorWidget.QuickOpenEditorWidget;

	constructor(editor:EditorBrowser.ICodeEditor, @INullService ns) {
		this.editor = editor;
	}

	public getId(): string {
		return QuickOpenController.ID;
	}

	public dispose(): void {
		// Dispose widget
		if (this.widget) {
			this.widget.destroy();
			this.widget = null;
		}
	}

	public run(opts:IQuickOpenControllerOpts): void {
		if (this.widget) {
			this.widget.destroy();
			this.widget = null;
		}
		// Create goto line widget
		if (!this.widget) {
			this.widget = new QuickOpenEditorWidget.QuickOpenEditorWidget(
				this.editor,
				()=>opts.onOk(),
				()=>opts.onCancel(),
				(value:string)=>{
					this.widget.setInput(opts.getModel(value), opts.getAutoFocus(value));
				},
				{
					inputAriaLabel: opts.inputAriaLabel
				}
			);

			// Show
			this.widget.show('');
		}
	}
}

/**
 * Base class for providing quick open in the editor.
 */
export class BaseEditorQuickOpenAction extends EditorAction {
	private lineHighlightDecorationId:string;
	private lastKnownEditorSelection:EditorCommon.IEditorSelection;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, label:string, condition:Behaviour = Behaviour.WidgetFocus) {
		super(descriptor, editor, condition);

		this.label = label;
	}

	public run():TPromise<boolean> {
		QuickOpenController.get(this.editor).run({
			inputAriaLabel: this._getInputAriaLabel(),
			getModel: (value:string):QuickOpenModel.QuickOpenModel => this._getModel(value),
			getAutoFocus: (searchValue:string):QuickOpen.IAutoFocus => this._getAutoFocus(searchValue),
			onOk: ():void => this._onClose(false),
			onCancel: ():void => this._onClose(true)
		});
		// }
		// 	()=>this._onClose(false),
		// 	()=>this._onClose(true),
		// 	(value:string)=>this.onType(value),
		// )
		// this._getInputAriaLabel()
		// this.widget = new QuickOpenEditorWidget.QuickOpenEditorWidget(
		// 		this.editor,
		// 		()=>this._onClose(false),
		// 		()=>this._onClose(true),
		// 		(value:string)=>this.onType(value),
		// 		{
		// 			inputAriaLabel: this._getInputAriaLabel()
		// 		}
		// 	);

		// Remember selection to be able to restore on cancel
		if (!this.lastKnownEditorSelection) {
			this.lastKnownEditorSelection = this.editor.getSelection();
		}



		return TPromise.as(true);
	}

	/**
	 * Subclasses to override to provide the quick open model for the given search value.
	 */
	_getModel(value:string):QuickOpenModel.QuickOpenModel {
		throw new Error('Subclasses to implement');
	}

	/**
	 * Subclasses to override to provide the quick open auto focus mode for the given search value.
	 */
	_getAutoFocus(searchValue:string):QuickOpen.IAutoFocus {
		throw new Error('Subclasses to implement');
	}

	_getInputAriaLabel(): string {
		throw new Error('Subclasses to implement');
	}



	public decorateLine(range:EditorCommon.IRange, editor:EditorBrowser.ICodeEditor):void {
		editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor)=>{
			var oldDecorations: string[] = [];
			if (this.lineHighlightDecorationId) {
				oldDecorations.push(this.lineHighlightDecorationId);
				this.lineHighlightDecorationId = null;
			}

			var newDecorations: EditorCommon.IModelDeltaDecoration[] = [
				{
					range: range,
					options: {
						className: 'lineHighlight',
						isWholeLine: true
					}
				}
			];

			var decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);
			this.lineHighlightDecorationId = decorations[0];
		});
	}

	public clearDecorations():void {
		if (this.lineHighlightDecorationId) {
			this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor)=>{
				changeAccessor.deltaDecorations([this.lineHighlightDecorationId], []);
				this.lineHighlightDecorationId = null;
			});
		}
	}

	/**
	 * Subclasses can override this to participate in the close of quick open.
	 */
	_onClose(canceled:boolean):void {

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorSelection) {
			this.editor.setSelection(this.lastKnownEditorSelection);
			this.editor.revealRangeInCenterIfOutsideViewport(this.lastKnownEditorSelection);
		}

		this.lastKnownEditorSelection = null;
		this.editor.focus();
	}

	public dispose(): void {
		super.dispose();


	}
}

export interface IDecorator {
	decorateLine(range:EditorCommon.IRange, editor:EditorCommon.IEditor):void;
	clearDecorations():void;
}

EditorBrowserRegistry.registerEditorContribution(QuickOpenController);
