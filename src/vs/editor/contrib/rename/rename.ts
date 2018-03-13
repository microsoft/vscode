/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { isPromiseCanceledError, illegalArgument } from 'vs/base/common/errors';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileService } from 'vs/platform/files/common/files';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction, EditorCommand, registerEditorCommand, registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { BulkEdit } from 'vs/editor/browser/services/bulkEdit';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import RenameInputField from './renameInputField';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { asWinJsPromise } from 'vs/base/common/async';
import { WorkspaceEdit, RenameProviderRegistry, RenameContext, RenameProvider } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Range } from 'vs/editor/common/core/range';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';

class RenameSkeleton {

	private _provider: RenameProvider[];

	constructor(
		readonly model: ITextModel,
		readonly position: Position
	) {
		this._provider = RenameProviderRegistry.ordered(model);
	}

	hasProvider() {
		return this._provider.length > 0;
	}

	async resolveRenameInformation(): TPromise<RenameContext> {

		let [provider] = this._provider;
		let information: RenameContext;

		if (provider.resolveRenameContext) {
			information = await asWinJsPromise(token => provider.resolveRenameContext(this.model, this.position, token));
		}

		if (!information) {
			let word = this.model.getWordAtPosition(this.position);
			if (word) {
				information = {
					range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
					text: word.word
				};
			}
		}

		return information;
	}

	async provideRenameEdits(newName: string, i: number = 0, rejects: string[] = []): TPromise<WorkspaceEdit> {

		if (i >= this._provider.length) {
			return {
				edits: undefined,
				rejectReason: rejects.join('\n')
			};
		}

		let provider = this._provider[i];
		let result = await asWinJsPromise((token) => provider.provideRenameEdits(this.model, this.position, newName, token));
		if (!result) {
			return this.provideRenameEdits(newName, i + 1, rejects.concat(nls.localize('no result', "No result.")));
		} else if (result.rejectReason) {
			return this.provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason));
		}
		return result;
	}
}

export async function rename(model: ITextModel, position: Position, newName: string): TPromise<WorkspaceEdit> {
	return new RenameSkeleton(model, position).provideRenameEdits(newName);
}

// ---  register actions and commands

const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false);

class RenameController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.renameController';

	public static get(editor: ICodeEditor): RenameController {
		return editor.getContribution<RenameController>(RenameController.ID);
	}

	private _renameInputField: RenameInputField;
	private _renameInputVisible: IContextKey<boolean>;

	constructor(
		private editor: ICodeEditor,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IProgressService private readonly _progressService: IProgressService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@optional(IFileService) private _fileService: IFileService
	) {
		this._renameInputField = new RenameInputField(editor, themeService);
		this._renameInputVisible = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
	}

	public dispose(): void {
		this._renameInputField.dispose();
	}

	public getId(): string {
		return RenameController.ID;
	}

	public async run(): TPromise<void> {

		const skeleton = new RenameSkeleton(this.editor.getModel(), this.editor.getPosition());

		let initialValue = await skeleton.resolveRenameInformation();
		if (!initialValue) {
			return undefined;
		}

		let selection = this.editor.getSelection();
		let selectionStart = 0;
		let selectionEnd = initialValue.text.length;

		if (!selection.isEmpty() && selection.startLineNumber === selection.endLineNumber) {
			selectionStart = Math.max(0, selection.startColumn - initialValue.range.startColumn);
			selectionEnd = Math.min(initialValue.range.endColumn, selection.endColumn) - initialValue.range.startColumn;
		}

		this._renameInputVisible.set(true);
		return this._renameInputField.getInput(Range.lift(initialValue.range), initialValue.text, selectionStart, selectionEnd).then(newName => {
			this._renameInputVisible.reset();
			this.editor.focus();

			const edit = new BulkEdit(this.editor, null, this._textModelResolverService, this._fileService);
			const state = new EditorState(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Scroll);

			const renameOperation = skeleton.provideRenameEdits(newName).then(result => {
				if (result.rejectReason) {
					if (state.validate(this.editor)) {
						MessageController.get(this.editor).showMessage(result.rejectReason, this.editor.getPosition());
					} else {
						this._notificationService.info(result.rejectReason);
					}
					return undefined;
				}
				edit.add(result.edits);

				return edit.perform().then(selection => {
					if (selection) {
						this.editor.setSelection(selection);
					}
					// alert
					alert(nls.localize('aria', "Successfully renamed '{0}' to '{1}'. Summary: {2}", initialValue.text, newName, edit.ariaMessage()));
				});

			}, err => {
				this._notificationService.error(nls.localize('rename.failed', "Rename failed to execute."));
				return TPromise.wrapError(err);
			});

			this._progressService.showWhile(renameOperation, 250);
			return renameOperation;

		}, err => {
			this._renameInputVisible.reset();

			if (!isPromiseCanceledError(err)) {
				this.editor.focus();
				return TPromise.wrapError(err);
			}
			return undefined;
		});
	}

	public acceptRenameInput(): void {
		this._renameInputField.acceptInput();
	}

	public cancelRenameInput(): void {
		this._renameInputField.cancelInput();
	}
}

// ---- action implementation

export class RenameAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.rename',
			label: nls.localize('rename.label', "Rename Symbol"),
			alias: 'Rename Symbol',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyCode.F2
			},
			menuOpts: {
				group: '1_modification',
				order: 1.1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<void> {
		let controller = RenameController.get(editor);
		if (controller) {
			return controller.run();
		}
		return undefined;
	}
}

registerEditorContribution(RenameController);
registerEditorAction(RenameAction);

const RenameCommand = EditorCommand.bindToContribution<RenameController>(RenameController.get);

registerEditorCommand(new RenameCommand({
	id: 'acceptRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.acceptRenameInput(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(99),
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Enter
	}
}));

registerEditorCommand(new RenameCommand({
	id: 'cancelRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.cancelRenameInput(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(99),
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

// ---- api bridge command

registerDefaultLanguageCommand('_executeDocumentRenameProvider', function (model, position, args) {
	let { newName } = args;
	if (typeof newName !== 'string') {
		throw illegalArgument('newName');
	}
	return rename(model, position, newName);
});
