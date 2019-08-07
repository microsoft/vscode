/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./editorQuickOpen';
import { QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, IActionOptions, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { QuickOpenEditorWidget } from 'vs/editor/standalone/browser/quickOpen/quickOpenEditorWidget';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export interface IQuickOpenControllerOpts {
	inputAriaLabel: string;
	getModel(value: string): QuickOpenModel;
	getAutoFocus(searchValue: string): IAutoFocus;
}

export class QuickOpenController implements editorCommon.IEditorContribution, IDecorator {

	private static readonly ID = 'editor.controller.quickOpenController';

	public static get(editor: ICodeEditor): QuickOpenController {
		return editor.getContribution<QuickOpenController>(QuickOpenController.ID);
	}

	private readonly editor: ICodeEditor;
	private widget: QuickOpenEditorWidget | null = null;
	private rangeHighlightDecorationId: string | null = null;
	private lastKnownEditorSelection: Selection | null = null;

	constructor(editor: ICodeEditor, @IThemeService private readonly themeService: IThemeService) {
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
				this.editor.revealRangeInCenterIfOutsideViewport(this.lastKnownEditorSelection, editorCommon.ScrollType.Smooth);
			}

			this.lastKnownEditorSelection = null;

			// Return focus to the editor if
			// - focus is back on the <body> element because no other focusable element was clicked
			// - a command was picked from the picker which indicates the editor should get focused
			if (document.activeElement === document.body || !canceled) {
				this.editor.focus();
			}
		};

		this.widget = new QuickOpenEditorWidget(
			this.editor,
			() => onClose(false),
			() => onClose(true),
			(value: string) => {
				this.widget!.setInput(opts.getModel(value), opts.getAutoFocus(value));
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

	private static readonly _RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
		className: 'rangeHighlight',
		isWholeLine: true
	});

	public decorateLine(range: Range, editor: ICodeEditor): void {
		const oldDecorations: string[] = [];
		if (this.rangeHighlightDecorationId) {
			oldDecorations.push(this.rangeHighlightDecorationId);
			this.rangeHighlightDecorationId = null;
		}

		const newDecorations: IModelDeltaDecoration[] = [
			{
				range: range,
				options: QuickOpenController._RANGE_HIGHLIGHT_DECORATION
			}
		];

		const decorations = editor.deltaDecorations(oldDecorations, newDecorations);
		this.rangeHighlightDecorationId = decorations[0];
	}

	public clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editor.deltaDecorations([this.rangeHighlightDecorationId], []);
			this.rangeHighlightDecorationId = null;
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

	private readonly _inputAriaLabel: string;

	constructor(inputAriaLabel: string, opts: IActionOptions) {
		super(opts);
		this._inputAriaLabel = inputAriaLabel;
	}

	protected getController(editor: ICodeEditor): QuickOpenController {
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
	decorateLine(range: Range, editor: editorCommon.IEditor): void;
	clearDecorations(): void;
}

registerEditorContribution(QuickOpenController);
