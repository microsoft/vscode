/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import { Rejection, RenameLocation, RenameProvider, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { CONTEXT_RENAME_INPUT_VISIBLE, RenameInputField } from './renameInputField';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

class RenameSkeleton {

	private readonly _providers: RenameProvider[];
	private _providerRenameIdx: number = 0;

	constructor(
		private readonly model: ITextModel,
		private readonly position: Position,
		registry: LanguageFeatureRegistry<RenameProvider>
	) {
		this._providers = registry.ordered(model);
	}

	hasProvider() {
		return this._providers.length > 0;
	}

	async resolveRenameLocation(token: CancellationToken): Promise<RenameLocation & Rejection | undefined> {

		const rejects: string[] = [];

		for (this._providerRenameIdx = 0; this._providerRenameIdx < this._providers.length; this._providerRenameIdx++) {
			const provider = this._providers[this._providerRenameIdx];
			if (!provider.resolveRenameLocation) {
				break;
			}
			const res = await provider.resolveRenameLocation(this.model, this.position, token);
			if (!res) {
				continue;
			}
			if (res.rejectReason) {
				rejects.push(res.rejectReason);
				continue;
			}
			return res;
		}

		const word = this.model.getWordAtPosition(this.position);
		if (!word) {
			return {
				range: Range.fromPositions(this.position),
				text: '',
				rejectReason: rejects.length > 0 ? rejects.join('\n') : undefined
			};
		}
		return {
			range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
			text: word.word,
			rejectReason: rejects.length > 0 ? rejects.join('\n') : undefined
		};
	}

	async provideRenameEdits(newName: string, token: CancellationToken): Promise<WorkspaceEdit & Rejection> {
		return this._provideRenameEdits(newName, this._providerRenameIdx, [], token);
	}

	private async _provideRenameEdits(newName: string, i: number, rejects: string[], token: CancellationToken): Promise<WorkspaceEdit & Rejection> {
		const provider = this._providers[i];
		if (!provider) {
			return {
				edits: [],
				rejectReason: rejects.join('\n')
			};
		}

		const result = await provider.provideRenameEdits(this.model, this.position, newName, token);
		if (!result) {
			return this._provideRenameEdits(newName, i + 1, rejects.concat(nls.localize('no result', "No result.")), token);
		} else if (result.rejectReason) {
			return this._provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason), token);
		}
		return result;
	}
}

export async function rename(registry: LanguageFeatureRegistry<RenameProvider>, model: ITextModel, position: Position, newName: string): Promise<WorkspaceEdit & Rejection> {
	const skeleton = new RenameSkeleton(model, position, registry);
	const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
	if (loc?.rejectReason) {
		return { edits: [], rejectReason: loc.rejectReason };
	}
	return skeleton.provideRenameEdits(newName, CancellationToken.None);
}

// ---  register actions and commands

class RenameController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.renameController';

	static get(editor: ICodeEditor): RenameController | null {
		return editor.getContribution<RenameController>(RenameController.ID);
	}

	private readonly _renameInputField: RenameInputField;
	private readonly _disposableStore = new DisposableStore();
	private _cts: CancellationTokenSource = new CancellationTokenSource();

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IEditorProgressService private readonly _progressService: IEditorProgressService,
		@ILogService private readonly _logService: ILogService,
		@ITextResourceConfigurationService private readonly _configService: ITextResourceConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		this._renameInputField = this._disposableStore.add(this._instaService.createInstance(RenameInputField, this.editor, ['acceptRenameInput', 'acceptRenameInputWithPreview']));
	}

	dispose(): void {
		this._disposableStore.dispose();
		this._cts.dispose(true);
	}

	async run(): Promise<void> {

		// set up cancellation token to prevent reentrant rename, this
		// is the parent to the resolve- and rename-tokens
		this._cts.dispose(true);
		this._cts = new CancellationTokenSource();

		if (!this.editor.hasModel()) {
			return undefined;
		}

		const position = this.editor.getPosition();
		const skeleton = new RenameSkeleton(this.editor.getModel(), position, this._languageFeaturesService.renameProvider);

		if (!skeleton.hasProvider()) {
			return undefined;
		}

		// part 1 - resolve rename location
		const cts1 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, undefined, this._cts.token);

		let loc: RenameLocation & Rejection | undefined;
		try {
			const resolveLocationOperation = skeleton.resolveRenameLocation(cts1.token);
			this._progressService.showWhile(resolveLocationOperation, 250);
			loc = await resolveLocationOperation;

		} catch (e) {
			MessageController.get(this.editor)?.showMessage(e || nls.localize('resolveRenameLocationFailed', "An unknown error occurred while resolving rename location"), position);
			return undefined;

		} finally {
			cts1.dispose();
		}

		if (!loc) {
			return undefined;
		}

		if (loc.rejectReason) {
			MessageController.get(this.editor)?.showMessage(loc.rejectReason, position);
			return undefined;
		}

		if (cts1.token.isCancellationRequested) {
			return undefined;
		}

		// part 2 - do rename at location
		const cts2 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, loc.range, this._cts.token);

		const selection = this.editor.getSelection();
		let selectionStart = 0;
		let selectionEnd = loc.text.length;

		if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(loc.range, selection)) {
			selectionStart = Math.max(0, selection.startColumn - loc.range.startColumn);
			selectionEnd = Math.min(loc.range.endColumn, selection.endColumn) - loc.range.startColumn;
		}

		const supportPreview = this._bulkEditService.hasPreviewHandler() && this._configService.getValue<boolean>(this.editor.getModel().uri, 'editor.rename.enablePreview');
		const inputFieldResult = await this._renameInputField.getInput(loc.range, loc.text, selectionStart, selectionEnd, supportPreview, cts2.token);

		// no result, only hint to focus the editor or not
		if (typeof inputFieldResult === 'boolean') {
			if (inputFieldResult) {
				this.editor.focus();
			}
			cts2.dispose();
			return undefined;
		}

		this.editor.focus();

		const renameOperation = raceCancellation(skeleton.provideRenameEdits(inputFieldResult.newName, cts2.token), cts2.token).then(async renameResult => {

			if (!renameResult || !this.editor.hasModel()) {
				return;
			}

			if (renameResult.rejectReason) {
				this._notificationService.info(renameResult.rejectReason);
				return;
			}

			// collapse selection to active end
			this.editor.setSelection(Range.fromPositions(this.editor.getSelection().getPosition()));

			this._bulkEditService.apply(renameResult, {
				editor: this.editor,
				showPreview: inputFieldResult.wantsPreview,
				label: nls.localize('label', "Renaming '{0}' to '{1}'", loc?.text, inputFieldResult.newName),
				code: 'undoredo.rename',
				quotableLabel: nls.localize('quotableLabel', "Renaming {0} to {1}", loc?.text, inputFieldResult.newName),
				respectAutoSaveConfig: true
			}).then(result => {
				if (result.ariaSummary) {
					alert(nls.localize('aria', "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc!.text, inputFieldResult.newName, result.ariaSummary));
				}
			}).catch(err => {
				this._notificationService.error(nls.localize('rename.failedApply', "Rename failed to apply edits"));
				this._logService.error(err);
			});

		}, err => {
			this._notificationService.error(nls.localize('rename.failed', "Rename failed to compute edits"));
			this._logService.error(err);

		}).finally(() => {
			cts2.dispose();
		});

		this._progressService.showWhile(renameOperation, 250);
		return renameOperation;

	}

	acceptRenameInput(wantsPreview: boolean): void {
		this._renameInputField.acceptInput(wantsPreview);
	}

	cancelRenameInput(): void {
		this._renameInputField.cancelInput(true);
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
			contextMenuOpts: {
				group: '1_modification',
				order: 1.1
			}
		});
	}

	override runCommand(accessor: ServicesAccessor, args: [URI, IPosition]): void | Promise<void> {
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

registerEditorContribution(RenameController.ID, RenameController, EditorContributionInstantiation.Lazy);
registerEditorAction(RenameAction);

const RenameCommand = EditorCommand.bindToContribution<RenameController>(RenameController.get);

registerEditorCommand(new RenameCommand({
	id: 'acceptRenameInput',
	precondition: CONTEXT_RENAME_INPUT_VISIBLE,
	handler: x => x.acceptRenameInput(false),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 99,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
		primary: KeyCode.Enter
	}
}));

registerEditorCommand(new RenameCommand({
	id: 'acceptRenameInputWithPreview',
	precondition: ContextKeyExpr.and(CONTEXT_RENAME_INPUT_VISIBLE, ContextKeyExpr.has('config.editor.rename.enablePreview')),
	handler: x => x.acceptRenameInput(true),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 99,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
		primary: KeyMod.Shift + KeyCode.Enter
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

registerModelAndPositionCommand('_executeDocumentRenameProvider', function (accessor, model, position, ...args) {
	const [newName] = args;
	assertType(typeof newName === 'string');
	const { renameProvider } = accessor.get(ILanguageFeaturesService);
	return rename(renameProvider, model, position, newName);
});

registerModelAndPositionCommand('_executePrepareRename', async function (accessor, model, position) {
	const { renameProvider } = accessor.get(ILanguageFeaturesService);
	const skeleton = new RenameSkeleton(model, position, renameProvider);
	const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
	if (loc?.rejectReason) {
		throw new Error(loc.rejectReason);
	}
	return loc;
});


//todo@jrieken use editor options world
Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		'editor.rename.enablePreview': {
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			description: nls.localize('enablePreview', "Enable/disable the ability to preview changes before renaming"),
			default: true,
			type: 'boolean'
		}
	}
});
