/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { illegalArgument, onUnexpectedError } from 'vs/base/common/errors';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction, EditorCommand, registerEditorCommand, registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { RenameInputField, CONTEXT_RENAME_INPUT_VISIBLE } from './renameInputField';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { WorkspaceEdit, RenameProviderRegistry, RenameProvider, RenameLocation, Rejection } from 'vs/editor/common/modes';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Range } from 'vs/editor/common/core/range';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';

class RenameSkeleton {

	private readonly _providers: RenameProvider[];

	constructor(
		private readonly model: ITextModel,
		private readonly position: Position
	) {
		this._providers = RenameProviderRegistry.ordered(model);
	}

	hasProvider() {
		return this._providers.length > 0;
	}

	async resolveRenameLocation(token: CancellationToken): Promise<RenameLocation & Rejection | null | undefined> {
		const firstProvider = this._providers[0];
		if (!firstProvider) {
			return undefined;
		}

		let res: RenameLocation & Rejection | null | undefined;
		if (firstProvider.resolveRenameLocation) {
			res = await firstProvider.resolveRenameLocation(this.model, this.position, token);
		}

		if (!res) {
			const word = this.model.getWordAtPosition(this.position);
			if (word) {
				return {
					range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
					text: word.word
				};
			}
		}

		return res;
	}

	async provideRenameEdits(newName: string, i: number, rejects: string[], token: CancellationToken): Promise<WorkspaceEdit & Rejection> {
		const provider = this._providers[i];
		if (!provider) {
			return {
				edits: [],
				rejectReason: rejects.join('\n')
			};
		}

		const result = await provider.provideRenameEdits(this.model, this.position, newName, token);
		if (!result) {
			return this.provideRenameEdits(newName, i + 1, rejects.concat(nls.localize('no result', "No result.")), token);
		} else if (result.rejectReason) {
			return this.provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason), token);
		}
		return result;
	}
}

export async function rename(model: ITextModel, position: Position, newName: string): Promise<WorkspaceEdit & Rejection> {
	return new RenameSkeleton(model, position).provideRenameEdits(newName, 0, [], CancellationToken.None);
}

// ---  register actions and commands

class RenameController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.renameController';

	public static get(editor: ICodeEditor): RenameController {
		return editor.getContribution<RenameController>(RenameController.ID);
	}

	private _renameInputField?: RenameInputField;
	private _renameOperationIdPool = 1;

	private _activeRename?: {
		readonly id: number;
		readonly operation: CancelablePromise<void>;
	};

	constructor(
		private readonly editor: ICodeEditor,
		@INotificationService private readonly _notificationService: INotificationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IEditorProgressService private readonly _progressService: IEditorProgressService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelLanguage(() => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(() => this.onModelChanged()));
	}

	private get renameInputField(): RenameInputField {
		if (!this._renameInputField) {
			this._renameInputField = this._register(new RenameInputField(this.editor, this._themeService, this._contextKeyService));
		}
		return this._renameInputField;
	}

	getId(): string {
		return RenameController.ID;
	}

	async run(): Promise<void> {
		if (this._activeRename) {
			this._activeRename.operation.cancel();
		}

		const id = this._renameOperationIdPool++;
		this._activeRename = {
			id,
			operation: createCancelablePromise(token => this.doRename(token, id))
		};
		return this._activeRename.operation;
	}

	private async doRename(token: CancellationToken, id: number): Promise<void> {
		if (!this.editor.hasModel()) {
			return undefined;
		}

		const position = this.editor.getPosition();
		const skeleton = new RenameSkeleton(this.editor.getModel(), position);

		if (!skeleton.hasProvider()) {
			return undefined;
		}

		let loc: RenameLocation & Rejection | null | undefined;
		try {
			const resolveLocationOperation = skeleton.resolveRenameLocation(token);
			this._progressService.showWhile(resolveLocationOperation, 250);
			loc = await resolveLocationOperation;
		} catch (e) {
			MessageController.get(this.editor).showMessage(e || nls.localize('resolveRenameLocationFailed', "An unknown error occurred while resolving rename location"), position);
			return undefined;
		}

		if (!loc) {
			return undefined;
		}

		if (loc.rejectReason) {
			MessageController.get(this.editor).showMessage(loc.rejectReason, position);
			return undefined;
		}

		if (!this._activeRename || this._activeRename.id !== id) {
			return undefined;
		}

		let selection = this.editor.getSelection();
		let selectionStart = 0;
		let selectionEnd = loc.text.length;

		if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(loc.range, selection)) {
			selectionStart = Math.max(0, selection.startColumn - loc.range.startColumn);
			selectionEnd = Math.min(loc.range.endColumn, selection.endColumn) - loc.range.startColumn;
		}

		return this.renameInputField.getInput(loc.range, loc.text, selectionStart, selectionEnd).then(newNameOrFocusFlag => {

			if (typeof newNameOrFocusFlag === 'boolean') {
				if (newNameOrFocusFlag) {
					this.editor.focus();
				}
				return undefined;
			}

			this.editor.focus();

			const state = new EditorState(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Scroll);

			const renameOperation = Promise.resolve(skeleton.provideRenameEdits(newNameOrFocusFlag, 0, [], token).then(result => {

				if (!this.editor.hasModel()) {
					return undefined;
				}

				if (result.rejectReason) {
					if (state.validate(this.editor)) {
						MessageController.get(this.editor).showMessage(result.rejectReason, this.editor.getPosition());
					} else {
						this._notificationService.info(result.rejectReason);
					}
					return undefined;
				}

				return this._bulkEditService.apply(result, { editor: this.editor }).then(result => {
					// alert
					if (result.ariaSummary) {
						alert(nls.localize('aria', "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc!.text, newNameOrFocusFlag, result.ariaSummary));
					}
				});

			}, err => {
				this._notificationService.error(nls.localize('rename.failed', "Rename failed to execute."));
				return Promise.reject(err);
			}));

			this._progressService.showWhile(renameOperation, 250);
			return renameOperation;

		});
	}

	public acceptRenameInput(): void {
		if (this._renameInputField) {
			this._renameInputField.acceptInput();
		}
	}

	public cancelRenameInput(): void {
		if (this._renameInputField) {
			this._renameInputField.cancelInput(true);
		}
	}

	private onModelChanged(): void {
		if (this._activeRename) {
			this._activeRename.operation.cancel();
			this._activeRename = undefined;
		}
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
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F2,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: '1_modification',
				order: 1.1
			}
		});
	}

	runCommand(accessor: ServicesAccessor, args: [URI, IPosition]): void | Promise<void> {
		const editorService = accessor.get(ICodeEditorService);
		const [uri, pos] = Array.isArray(args) && args || [undefined, undefined];

		if (URI.isUri(uri) && Position.isIPosition(pos)) {
			return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then(editor => {
				if (!editor) {
					return;
				}
				editor.setPosition(pos);
				editor.invokeWithinContext(accessor => {
					this.reportTelemetry(accessor, editor);
					return this.run(accessor, editor);
				});
			}, onUnexpectedError);
		}

		return super.runCommand(accessor, args);
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = RenameController.get(editor);
		if (controller) {
			return controller.run();
		}
		return Promise.resolve();
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
		weight: KeybindingWeight.EditorContrib + 99,
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Enter
	}
}));

registerEditorCommand(new RenameCommand({
	id: 'cancelRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.cancelRenameInput(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 99,
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
