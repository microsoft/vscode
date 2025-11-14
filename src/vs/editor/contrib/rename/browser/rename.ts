/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { NewSymbolNameTriggerKind, Rejection, RenameLocation, RenameProvider, WorkspaceEdit } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';
import { EditSources } from '../../../common/textModelEditSource.js';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { MessageController } from '../../message/browser/messageController.js';
import { CONTEXT_RENAME_INPUT_VISIBLE, RenameWidget } from './renameWidget.js';

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

		// we are here when no provider prepared a location which means we can
		// just rely on the word under cursor and start with the first provider
		this._providerRenameIdx = 0;

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

	private readonly _renameWidget: RenameWidget;
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
		this._renameWidget = this._disposableStore.add(this._instaService.createInstance(RenameWidget, this.editor, ['acceptRenameInput', 'acceptRenameInputWithPreview']));
	}

	dispose(): void {
		this._disposableStore.dispose();
		this._cts.dispose(true);
	}

	async run(): Promise<void> {

		const trace = this._logService.trace.bind(this._logService, '[rename]');

		// set up cancellation token to prevent reentrant rename, this
		// is the parent to the resolve- and rename-tokens
		this._cts.dispose(true);
		this._cts = new CancellationTokenSource();

		if (!this.editor.hasModel()) {
			trace('editor has no model');
			return undefined;
		}

		const position = this.editor.getPosition();
		const skeleton = new RenameSkeleton(this.editor.getModel(), position, this._languageFeaturesService.renameProvider);

		if (!skeleton.hasProvider()) {
			trace('skeleton has no provider');
			return undefined;
		}

		// part 1 - resolve rename location
		const cts1 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, undefined, this._cts.token);

		let loc: RenameLocation & Rejection | undefined;
		try {
			trace('resolving rename location');
			const resolveLocationOperation = skeleton.resolveRenameLocation(cts1.token);
			this._progressService.showWhile(resolveLocationOperation, 250);
			loc = await resolveLocationOperation;
			trace('resolved rename location');
		} catch (e: unknown) {
			if (e instanceof CancellationError) {
				trace('resolve rename location cancelled', JSON.stringify(e, null, '\t'));
			} else {
				trace('resolve rename location failed', e instanceof Error ? e : JSON.stringify(e, null, '\t'));
				if (typeof e === 'string' || isMarkdownString(e)) {
					MessageController.get(this.editor)?.showMessage(e || nls.localize('resolveRenameLocationFailed', "An unknown error occurred while resolving rename location"), position);
				}
			}
			return undefined;

		} finally {
			cts1.dispose();
		}

		if (!loc) {
			trace('returning early - no loc');
			return undefined;
		}

		if (loc.rejectReason) {
			trace(`returning early - rejected with reason: ${loc.rejectReason}`, loc.rejectReason);
			MessageController.get(this.editor)?.showMessage(loc.rejectReason, position);
			return undefined;
		}

		if (cts1.token.isCancellationRequested) {
			trace('returning early - cts1 cancelled');
			return undefined;
		}

		// part 2 - do rename at location
		const cts2 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, loc.range, this._cts.token);

		const model = this.editor.getModel(); // @ulugbekna: assumes editor still has a model, otherwise, cts1 should've been cancelled

		const newSymbolNamesProviders = this._languageFeaturesService.newSymbolNamesProvider.all(model);

		const resolvedNewSymbolnamesProviders = await Promise.all(newSymbolNamesProviders.map(async p => [p, await p.supportsAutomaticNewSymbolNamesTriggerKind ?? false] as const));

		const requestRenameSuggestions = (triggerKind: NewSymbolNameTriggerKind, cts: CancellationToken) => {
			let providers = resolvedNewSymbolnamesProviders.slice();

			if (triggerKind === NewSymbolNameTriggerKind.Automatic) {
				providers = providers.filter(([_, supportsAutomatic]) => supportsAutomatic);
			}

			return providers.map(([p,]) => p.provideNewSymbolNames(model, loc.range, triggerKind, cts));
		};

		trace('creating rename input field and awaiting its result');
		const supportPreview = this._bulkEditService.hasPreviewHandler() && this._configService.getValue<boolean>(this.editor.getModel().uri, 'editor.rename.enablePreview');
		const inputFieldResult = await this._renameWidget.getInput(
			loc.range,
			loc.text,
			supportPreview,
			newSymbolNamesProviders.length > 0 ? requestRenameSuggestions : undefined,
			cts2
		);
		trace('received response from rename input field');

		// no result, only hint to focus the editor or not
		if (typeof inputFieldResult === 'boolean') {
			trace(`returning early - rename input field response - ${inputFieldResult}`);
			if (inputFieldResult) {
				this.editor.focus();
			}
			cts2.dispose();
			return undefined;
		}

		this.editor.focus();

		trace('requesting rename edits');
		const renameOperation = raceCancellation(skeleton.provideRenameEdits(inputFieldResult.newName, cts2.token), cts2.token).then(async renameResult => {

			if (!renameResult) {
				trace('returning early - no rename edits result');
				return;
			}
			if (!this.editor.hasModel()) {
				trace('returning early - no model after rename edits are provided');
				return;
			}

			if (renameResult.rejectReason) {
				trace(`returning early - rejected with reason: ${renameResult.rejectReason}`);
				this._notificationService.info(renameResult.rejectReason);
				return;
			}

			// collapse selection to active end
			this.editor.setSelection(Range.fromPositions(this.editor.getSelection().getPosition()));

			trace('applying edits');

			this._bulkEditService.apply(renameResult, {
				editor: this.editor,
				showPreview: inputFieldResult.wantsPreview,
				label: nls.localize('label', "Renaming '{0}' to '{1}'", loc?.text, inputFieldResult.newName),
				code: 'undoredo.rename',
				quotableLabel: nls.localize('quotableLabel', "Renaming {0} to {1}", loc?.text, inputFieldResult.newName),
				respectAutoSaveConfig: true,
				reason: EditSources.rename(),
			}).then(result => {
				trace('edits applied');
				if (result.ariaSummary) {
					alert(nls.localize('aria', "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc.text, inputFieldResult.newName, result.ariaSummary));
				}
			}).catch(err => {
				trace(`error when applying edits ${JSON.stringify(err, null, '\t')}`);
				this._notificationService.error(nls.localize('rename.failedApply', "Rename failed to apply edits"));
				this._logService.error(err);
			});

		}, err => {
			trace('error when providing rename edits', JSON.stringify(err, null, '\t'));

			this._notificationService.error(nls.localize('rename.failed', "Rename failed to compute edits"));
			this._logService.error(err);

		}).finally(() => {
			cts2.dispose();
		});

		trace('returning rename operation');

		this._progressService.showWhile(renameOperation, 250);
		return renameOperation;

	}

	acceptRenameInput(wantsPreview: boolean): void {
		this._renameWidget.acceptInput(wantsPreview);
	}

	cancelRenameInput(): void {
		this._renameWidget.cancelInput(true, 'cancelRenameInput command');
	}

	focusNextRenameSuggestion(): void {
		this._renameWidget.focusNextRenameSuggestion();
	}

	focusPreviousRenameSuggestion(): void {
		this._renameWidget.focusPreviousRenameSuggestion();
	}
}

// ---- action implementation

export class RenameAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.rename',
			label: nls.localize2('rename.label', "Rename Symbol"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F2,
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: '1_modification',
				order: 1.1
			},
			canTriggerInlineEdits: true,
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
		const logService = accessor.get(ILogService);

		const controller = RenameController.get(editor);

		if (controller) {
			logService.trace('[RenameAction] got controller, running...');
			return controller.run();
		}
		logService.trace('[RenameAction] returning early - controller missing');
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
		primary: KeyMod.CtrlCmd + KeyCode.Enter
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

registerAction2(class FocusNextRenameSuggestion extends Action2 {
	constructor() {
		super({
			id: 'focusNextRenameSuggestion',
			title: {
				...nls.localize2('focusNextRenameSuggestion', "Focus Next Rename Suggestion"),
			},
			precondition: CONTEXT_RENAME_INPUT_VISIBLE,
			keybinding: [
				{
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.EditorContrib + 99,
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!currentEditor) { return; }

		const controller = RenameController.get(currentEditor);
		if (!controller) { return; }

		controller.focusNextRenameSuggestion();
	}
});

registerAction2(class FocusPreviousRenameSuggestion extends Action2 {
	constructor() {
		super({
			id: 'focusPreviousRenameSuggestion',
			title: {
				...nls.localize2('focusPreviousRenameSuggestion', "Focus Previous Rename Suggestion"),
			},
			precondition: CONTEXT_RENAME_INPUT_VISIBLE,
			keybinding: [
				{
					primary: KeyCode.UpArrow,
					weight: KeybindingWeight.EditorContrib + 99,
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!currentEditor) { return; }

		const controller = RenameController.get(currentEditor);
		if (!controller) { return; }

		controller.focusPreviousRenameSuggestion();
	}
});

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
