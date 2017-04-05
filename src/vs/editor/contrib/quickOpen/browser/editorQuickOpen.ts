/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { QuickOpenEditorWidget } from './quickOpenEditorWidget';
import { Selection } from 'vs/editor/common/core/selection';
import { IActionOptions, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IThemeService } from "vs/platform/theme/common/themeService";

export interface IQuickOpenControllerOpts {
	inputAriaLabel: string;
	getModel(value: string): QuickOpenModel;
	getAutoFocus(searchValue: string): IAutoFocus;
}

@editorContribution
export class QuickOpenController implements editorCommon.IEditorContribution {

	private static ID = 'editor.controller.quickOpenController';

	public static get(editor: editorCommon.ICommonCodeEditor): QuickOpenController {
		return editor.getContribution<QuickOpenController>(QuickOpenController.ID);
	}

	private editor: ICodeEditor;
	private widget: QuickOpenEditorWidget;
	private rangeHighlightDecorationId: string;
	private lastKnownEditorSelection: Selection;

	constructor(editor: ICodeEditor, @IThemeService private themeService: IThemeService) {
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

	public run(opts: IQuickOpenControllerOpts): void {
		if (this.widget) {
			this.widget.destroy();
			this.widget = null;
		}

		// Create goto line widget
		let onClose = (canceled: boolean) => {
			// Clear Highlight Decorations if present
			this.clearDecorations();

			// Restore selection if canceled
			if (canceled && this.lastKnownEditorSelection) {
				this.editor.setSelection(this.lastKnownEditorSelection);
				this.editor.revealRangeInCenterIfOutsideViewport(this.lastKnownEditorSelection);
			}

			this.lastKnownEditorSelection = null;
			this.editor.focus();
		};

		this.widget = new QuickOpenEditorWidget(
			this.editor,
			() => onClose(false),
			() => onClose(true),
			(value: string) => {
				this.widget.setInput(opts.getModel(value), opts.getAutoFocus(value));
			},
			{
				inputAriaLabel: opts.inputAriaLabel
			},
			this.themeService
		);

		// Remember selection to be able to restore on cancel
		if (!this.lastKnownEditorSelection) {
			this.lastKnownEditorSelection = this.editor.getSelection();
		}

		// Show
		this.widget.show('');
	}

	public decorateLine(range: editorCommon.IRange, editor: ICodeEditor): void {
		editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			var oldDecorations: string[] = [];
			if (this.rangeHighlightDecorationId) {
				oldDecorations.push(this.rangeHighlightDecorationId);
				this.rangeHighlightDecorationId = null;
			}

			var newDecorations: editorCommon.IModelDeltaDecoration[] = [
				{
					range: range,
					options: {
						className: 'rangeHighlight',
						isWholeLine: true
					}
				}
			];

			var decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);
			this.rangeHighlightDecorationId = decorations[0];
		});
	}

	public clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
				changeAccessor.deltaDecorations([this.rangeHighlightDecorationId], []);
				this.rangeHighlightDecorationId = null;
			});
		}
	}
}

export interface IQuickOpenOpts {
	/**
	 * provide the quick open model for the given search value.
	 */
	getModel(value: string): QuickOpenModel;

	/**
	 * provide the quick open auto focus mode for the given search value.
	 */
	getAutoFocus(searchValue: string): IAutoFocus;
}

/**
 * Base class for providing quick open in the editor.
 */
export abstract class BaseEditorQuickOpenAction extends EditorAction {

	private _inputAriaLabel: string;

	constructor(inputAriaLabel: string, opts: IActionOptions) {
		super(opts);
		this._inputAriaLabel = inputAriaLabel;
	}

	protected getController(editor: editorCommon.ICommonCodeEditor): QuickOpenController {
		return QuickOpenController.get(editor);
	}

	protected _show(controller: QuickOpenController, opts: IQuickOpenOpts): void {
		controller.run({
			inputAriaLabel: this._inputAriaLabel,
			getModel: (value: string): QuickOpenModel => opts.getModel(value),
			getAutoFocus: (searchValue: string): IAutoFocus => opts.getAutoFocus(searchValue)
		});
	}
}

export interface IDecorator {
	decorateLine(range: editorCommon.IRange, editor: editorCommon.IEditor): void;
	clearDecorations(): void;
}
