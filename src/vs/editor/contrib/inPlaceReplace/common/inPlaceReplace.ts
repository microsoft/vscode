/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorContextKeys, IEditorContribution, CodeEditorStateFlag, ICommonCodeEditor, IModelDecorationsChangeAccessor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { IInplaceReplaceSupportResult } from 'vs/editor/common/modes';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { InPlaceReplaceCommand } from './inPlaceReplaceCommand';

@commonEditorContribution
class InPlaceReplaceController implements IEditorContribution {

	private static ID = 'editor.contrib.inPlaceReplaceController';

	static get(editor: ICommonCodeEditor): InPlaceReplaceController {
		return editor.getContribution<InPlaceReplaceController>(InPlaceReplaceController.ID);
	}

	private static DECORATION = {
		className: 'valueSetReplacement'
	};

	private editor: ICommonCodeEditor;
	private requestIdPool: number;
	private currentRequest: TPromise<IInplaceReplaceSupportResult>;
	private decorationRemover: TPromise<void>;
	private decorationIds: string[];
	private editorWorkerService: IEditorWorkerService;

	constructor(
		editor: ICommonCodeEditor,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		this.editor = editor;
		this.editorWorkerService = editorWorkerService;
		this.requestIdPool = 0;
		this.currentRequest = TPromise.as(<IInplaceReplaceSupportResult>null);
		this.decorationRemover = TPromise.as(<void>null);
		this.decorationIds = [];
	}

	public dispose(): void {
	}

	public getId(): string {
		return InPlaceReplaceController.ID;
	}

	public run(source: string, up: boolean): TPromise<void> {

		// cancel any pending request
		this.currentRequest.cancel();

		var selection = this.editor.getSelection(),
			model = this.editor.getModel(),
			modelURI = model.uri;

		if (selection.startLineNumber !== selection.endLineNumber) {
			// Can't accept multiline selection
			return null;
		}

		var state = this.editor.captureState(CodeEditorStateFlag.Value, CodeEditorStateFlag.Position);

		this.currentRequest = this.editorWorkerService.navigateValueSet(modelURI, selection, up);
		this.currentRequest = this.currentRequest.then((basicResult) => {
			if (basicResult && basicResult.range && basicResult.value) {
				return basicResult;
			}
			return null;
		});

		return this.currentRequest.then((result: IInplaceReplaceSupportResult) => {

			if (!result || !result.range || !result.value) {
				// No proper result
				return;
			}

			if (!state.validate(this.editor)) {
				// state has changed
				return;
			}

			// Selection
			var editRange = Range.lift(result.range),
				highlightRange = result.range,
				diff = result.value.length - (selection.endColumn - selection.startColumn);

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
			var command = new InPlaceReplaceCommand(editRange, selection, result.value);
			this.editor.executeCommand(source, command);

			// add decoration
			this.decorationIds = this.editor.deltaDecorations(this.decorationIds, [{
				range: highlightRange,
				options: InPlaceReplaceController.DECORATION
			}]);

			// remove decoration after delay
			this.decorationRemover.cancel();
			this.decorationRemover = TPromise.timeout(350);
			this.decorationRemover.then(() => {
				this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
					this.decorationIds = accessor.deltaDecorations(this.decorationIds, []);
				});
			});
		});
	}
}

@editorAction
class InPlaceReplaceUp extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inPlaceReplace.up',
			label: nls.localize('InPlaceReplaceAction.previous.label', "Replace with Previous Value"),
			alias: 'Replace with Previous Value',
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_COMMA
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		let controller = InPlaceReplaceController.get(editor);
		if (!controller) {
			return undefined;
		}
		return controller.run(this.id, true);
	}
}

@editorAction
class InPlaceReplaceDown extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inPlaceReplace.down',
			label: nls.localize('InPlaceReplaceAction.next.label', "Replace with Next Value"),
			alias: 'Replace with Next Value',
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		let controller = InPlaceReplaceController.get(editor);
		if (!controller) {
			return undefined;
		}
		return controller.run(this.id, false);
	}
}
