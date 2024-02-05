/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { CodeEditorStateFlag, EditorState } from 'vs/editor/contrib/editorState/browser/editorState';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IInplaceReplaceSupportResult } from 'vs/editor/common/languages';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import * as nls from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { InPlaceReplaceCommand } from './inPlaceReplaceCommand';
import 'vs/css!./inPlaceReplace';

class InPlaceReplaceController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.inPlaceReplaceController';

	static get(editor: ICodeEditor): InPlaceReplaceController | null {
		return editor.getContribution<InPlaceReplaceController>(InPlaceReplaceController.ID);
	}

	private static readonly DECORATION = ModelDecorationOptions.register({
		description: 'in-place-replace',
		className: 'valueSetReplacement'
	});

	private readonly editor: ICodeEditor;
	private readonly editorWorkerService: IEditorWorkerService;
	private readonly decorations: IEditorDecorationsCollection;
	private currentRequest?: CancelablePromise<IInplaceReplaceSupportResult | null>;
	private decorationRemover?: CancelablePromise<void>;

	constructor(
		editor: ICodeEditor,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		this.editor = editor;
		this.editorWorkerService = editorWorkerService;
		this.decorations = this.editor.createDecorationsCollection();
	}

	public dispose(): void {
	}

	public run(source: string, up: boolean): Promise<void> | undefined {

		// cancel any pending request
		this.currentRequest?.cancel();

		const editorSelection = this.editor.getSelection();
		const model = this.editor.getModel();
		if (!model || !editorSelection) {
			return undefined;
		}
		let selection = editorSelection;
		if (selection.startLineNumber !== selection.endLineNumber) {
			// Can't accept multiline selection
			return undefined;
		}

		const state = new EditorState(this.editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
		const modelURI = model.uri;
		if (!this.editorWorkerService.canNavigateValueSet(modelURI)) {
			return Promise.resolve(undefined);
		}

		this.currentRequest = createCancelablePromise(token => this.editorWorkerService.navigateValueSet(modelURI, selection, up));

		return this.currentRequest.then(result => {

			if (!result || !result.range || !result.value) {
				// No proper result
				return;
			}

			if (!state.validate(this.editor)) {
				// state has changed
				return;
			}

			// Selection
			const editRange = Range.lift(result.range);
			let highlightRange = result.range;
			const diff = result.value.length - (selection.endColumn - selection.startColumn);

			// highlight
			highlightRange = {
				startLineNumber: highlightRange.startLineNumber,
				startColumn: highlightRange.startColumn,
				endLineNumber: highlightRange.endLineNumber,
				endColumn: highlightRange.startColumn + result.value.length
			};
			if (diff > 1) {
				selection = new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + diff - 1);
			}

			// Insert new text
			const command = new InPlaceReplaceCommand(editRange, selection, result.value);

			this.editor.pushUndoStop();
			this.editor.executeCommand(source, command);
			this.editor.pushUndoStop();

			// add decoration
			this.decorations.set([{
				range: highlightRange,
				options: InPlaceReplaceController.DECORATION
			}]);

			// remove decoration after delay
			this.decorationRemover?.cancel();
			this.decorationRemover = timeout(350);
			this.decorationRemover.then(() => this.decorations.clear()).catch(onUnexpectedError);

		}).catch(onUnexpectedError);
	}
}

class InPlaceReplaceUp extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inPlaceReplace.up',
			label: nls.localize('InPlaceReplaceAction.previous.label', "Replace with Previous Value"),
			alias: 'Replace with Previous Value',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Comma,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> | undefined {
		const controller = InPlaceReplaceController.get(editor);
		if (!controller) {
			return Promise.resolve(undefined);
		}
		return controller.run(this.id, false);
	}
}

class InPlaceReplaceDown extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inPlaceReplace.down',
			label: nls.localize('InPlaceReplaceAction.next.label', "Replace with Next Value"),
			alias: 'Replace with Next Value',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> | undefined {
		const controller = InPlaceReplaceController.get(editor);
		if (!controller) {
			return Promise.resolve(undefined);
		}
		return controller.run(this.id, true);
	}
}

registerEditorContribution(InPlaceReplaceController.ID, InPlaceReplaceController, EditorContributionInstantiation.Lazy);
registerEditorAction(InPlaceReplaceUp);
registerEditorAction(InPlaceReplaceDown);
