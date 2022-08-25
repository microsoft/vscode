/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeActionTriggerType } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { codeActionCommandId, CodeActionItem, CodeActionSet, fixAllCommandId, organizeImportsCommandId, refactorCommandId, refactorPreviewCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionUi } from 'vs/editor/contrib/codeAction/browser/codeActionUi';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CodeActionModel, CodeActionsState, SUPPORTED_CODE_ACTIONS } from './codeActionModel';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionFilter, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from './types';
import { Context } from 'vs/editor/contrib/codeAction/browser/codeActionMenu';

function contextKeyForSupportedActions(kind: CodeActionKind) {
	return ContextKeyExpr.regex(
		SUPPORTED_CODE_ACTIONS.keys()[0],
		new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}

function refactorTrigger(editor: ICodeEditor, userArgs: any, preview: boolean, codeActionFrom: CodeActionTriggerSource) {
	const args = CodeActionCommandArgs.fromUser(userArgs, {
		kind: CodeActionKind.Refactor,
		apply: CodeActionAutoApply.Never
	});
	return triggerCodeActionsForEditorSelection(editor,
		typeof userArgs?.kind === 'string'
			? args.preferred
				? nls.localize('editor.action.refactor.noneMessage.preferred.kind', "No preferred refactorings for '{0}' available", userArgs.kind)
				: nls.localize('editor.action.refactor.noneMessage.kind', "No refactorings for '{0}' available", userArgs.kind)
			: args.preferred
				? nls.localize('editor.action.refactor.noneMessage.preferred', "No preferred refactorings available")
				: nls.localize('editor.action.refactor.noneMessage', "No refactorings available"),
		{
			include: CodeActionKind.Refactor.contains(args.kind) ? args.kind : CodeActionKind.None,
			onlyIncludePreferredActions: args.preferred
		},
		args.apply, preview, codeActionFrom);
}

const argsSchema: IJSONSchema = {
	type: 'object',
	defaultSnippets: [{ body: { kind: '' } }],
	properties: {
		'kind': {
			type: 'string',
			description: nls.localize('args.schema.kind', "Kind of the code action to run."),
		},
		'apply': {
			type: 'string',
			description: nls.localize('args.schema.apply', "Controls when the returned actions are applied."),
			default: CodeActionAutoApply.IfSingle,
			enum: [CodeActionAutoApply.First, CodeActionAutoApply.IfSingle, CodeActionAutoApply.Never],
			enumDescriptions: [
				nls.localize('args.schema.apply.first', "Always apply the first returned code action."),
				nls.localize('args.schema.apply.ifSingle', "Apply the first returned code action if it is the only one."),
				nls.localize('args.schema.apply.never', "Do not apply the returned code actions."),
			]
		},
		'preferred': {
			type: 'boolean',
			default: false,
			description: nls.localize('args.schema.preferred', "Controls if only preferred code actions should be returned."),
		}
	}
};

export class QuickFixController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.quickFixController';

	public static get(editor: ICodeEditor): QuickFixController | null {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _model: CodeActionModel;
	private readonly _ui: Lazy<CodeActionUi>;

	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorProgressService progressService: IEditorProgressService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._editor = editor;
		this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService));
		this._register(this._model.onDidChangeState(newState => this.update(newState)));


		this._ui = new Lazy(() =>
			this._register(new CodeActionUi(editor, QuickFixAction.Id, AutoFixAction.Id, {
				applyCodeAction: async (action, retrigger, preview) => {
					try {
						await this._applyCodeAction(action, preview);
					} finally {
						if (retrigger) {
							this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
						}
					}
				}
			}, this._instantiationService))
		);
	}

	private update(newState: CodeActionsState.State): void {
		this._ui.getValue().update(newState);
	}

	public hideCodeActionMenu() {
		if (this._ui.hasValue()) {
			this._ui.getValue().hideCodeActionWidget();
		}
	}

	public navigateCodeActionList(navUp: Boolean) {
		if (this._ui.hasValue()) {
			this._ui.getValue().navigateList(navUp);
		}
	}

	public selectedOption() {
		if (this._ui.hasValue()) {
			this._ui.getValue().onEnter();
		}
	}

	public selectedOptionWithPreview() {
		if (this._ui.hasValue()) {
			this._ui.getValue().onPreviewEnter();
		}

	}

	public showCodeActions(trigger: CodeActionTrigger, actions: CodeActionSet, at: IAnchor | IPosition) {
		return this._ui.getValue().showCodeActionList(trigger, actions, at, { includeDisabledActions: false, fromLightbulb: false });
	}

	public manualTriggerAtCurrentPosition(
		notAvailableMessage: string,
		triggerAction: CodeActionTriggerSource,
		filter?: CodeActionFilter,
		autoApply?: CodeActionAutoApply,
		preview?: boolean,

	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		MessageController.get(this._editor)?.closeMessage();
		const triggerPosition = this._editor.getPosition();
		this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition }, preview });
	}

	private _trigger(trigger: CodeActionTrigger) {
		return this._model.trigger(trigger);
	}

	private _applyCodeAction(action: CodeActionItem, preview: boolean): Promise<void> {
		return this._instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.FromCodeActions, { preview, editor: this._editor });
	}
}

export enum ApplyCodeActionReason {
	OnSave = 'onSave',
	FromProblemsView = 'fromProblemsView',
	FromCodeActions = 'fromCodeActions'
}


export async function applyCodeAction(
	accessor: ServicesAccessor,
	item: CodeActionItem,
	codeActionReason: ApplyCodeActionReason,
	options?: { preview?: boolean; editor?: ICodeEditor },
): Promise<void> {
	const bulkEditService = accessor.get(IBulkEditService);
	const commandService = accessor.get(ICommandService);
	const telemetryService = accessor.get(ITelemetryService);
	const notificationService = accessor.get(INotificationService);

	type ApplyCodeActionEvent = {
		codeActionTitle: string;
		codeActionKind: string | undefined;
		codeActionIsPreferred: boolean;
		reason: ApplyCodeActionReason;
	};
	type ApplyCodeEventClassification = {
		codeActionTitle: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The display label of the applied code action' };
		codeActionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind (refactor, quickfix) of the applied code action' };
		codeActionIsPreferred: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Was the code action marked as being a preferred action?' };
		reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to trigger apply code action.' };
		owner: 'mjbvz';
		comment: 'Event used to gain insights into which code actions are being triggered';
	};

	telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
		codeActionTitle: item.action.title,
		codeActionKind: item.action.kind,
		codeActionIsPreferred: !!item.action.isPreferred,
		reason: codeActionReason,
	});

	await item.resolve(CancellationToken.None);

	if (item.action.edit) {
		await bulkEditService.apply(item.action.edit, {
			editor: options?.editor,
			label: item.action.title,
			quotableLabel: item.action.title,
			code: 'undoredo.codeAction',
			respectAutoSaveConfig: true,
			showPreview: options?.preview,
		});
	}

	if (item.action.command) {
		try {
			await commandService.executeCommand(item.action.command.id, ...(item.action.command.arguments || []));
		} catch (err) {
			const message = asMessage(err);
			notificationService.error(
				typeof message === 'string'
					? message
					: nls.localize('applyCodeActionFailed', "An unknown error occurred while applying the code action"));
		}
	}
}

function asMessage(err: any): string | undefined {
	if (typeof err === 'string') {
		return err;
	} else if (err instanceof Error && typeof err.message === 'string') {
		return err.message;
	} else {
		return undefined;
	}
}

function triggerCodeActionsForEditorSelection(
	editor: ICodeEditor,
	notAvailableMessage: string,
	filter: CodeActionFilter | undefined,
	autoApply: CodeActionAutoApply | undefined,
	preview: boolean = false,
	triggerAction: CodeActionTriggerSource = CodeActionTriggerSource.Default
): void {
	if (editor.hasModel()) {
		const controller = QuickFixController.get(editor);
		controller?.manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply, preview);
	}
}

export class QuickFixAction extends EditorAction {

	static readonly Id = 'editor.action.quickFix';

	constructor() {
		super({
			id: QuickFixAction.Id,
			label: nls.localize('quickfix.trigger.label', "Quick Fix..."),
			alias: 'Quick Fix...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), undefined, undefined, false, CodeActionTriggerSource.QuickFix);
	}
}

export class CodeActionCommand extends EditorCommand {

	constructor() {
		super({
			id: codeActionCommandId,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			description: {
				description: 'Trigger a code action',
				args: [{ name: 'args', schema: argsSchema, }]
			}
		});
	}

	public runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any) {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: CodeActionKind.Empty,
			apply: CodeActionAutoApply.IfSingle,
		});
		return triggerCodeActionsForEditorSelection(editor,
			typeof userArgs?.kind === 'string'
				? args.preferred
					? nls.localize('editor.action.codeAction.noneMessage.preferred.kind', "No preferred code actions for '{0}' available", userArgs.kind)
					: nls.localize('editor.action.codeAction.noneMessage.kind', "No code actions for '{0}' available", userArgs.kind)
				: args.preferred
					? nls.localize('editor.action.codeAction.noneMessage.preferred', "No preferred code actions available")
					: nls.localize('editor.action.codeAction.noneMessage', "No code actions available"),
			{
				include: args.kind,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply);
	}
}


export class RefactorAction extends EditorAction {

	constructor() {
		super({
			id: refactorCommandId,
			label: nls.localize('refactor.label', "Refactor..."),
			alias: 'Refactor...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR
				},
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: '1_modification',
				order: 2,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Refactor)),
			},
			description: {
				description: 'Refactor...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
		return refactorTrigger(editor, userArgs, false, CodeActionTriggerSource.Refactor);
	}
}

export class RefactorPreview extends EditorAction {

	constructor() {
		super({
			id: refactorPreviewCommandId,
			label: nls.localize('refactor.preview.label', "Refactor with Preview..."),
			alias: 'Refactor Preview...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			description: {
				description: 'Refactor Preview...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
		return refactorTrigger(editor, userArgs, true, CodeActionTriggerSource.RefactorPreview);
	}
}

export class SourceAction extends EditorAction {

	constructor() {
		super({
			id: sourceActionCommandId,
			label: nls.localize('source.label', "Source Action..."),
			alias: 'Source Action...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			contextMenuOpts: {
				group: '1_modification',
				order: 2.1,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Source)),
			},
			description: {
				description: 'Source Action...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: CodeActionKind.Source,
			apply: CodeActionAutoApply.Never
		});
		return triggerCodeActionsForEditorSelection(editor,
			typeof userArgs?.kind === 'string'
				? args.preferred
					? nls.localize('editor.action.source.noneMessage.preferred.kind', "No preferred source actions for '{0}' available", userArgs.kind)
					: nls.localize('editor.action.source.noneMessage.kind', "No source actions for '{0}' available", userArgs.kind)
				: args.preferred
					? nls.localize('editor.action.source.noneMessage.preferred', "No preferred source actions available")
					: nls.localize('editor.action.source.noneMessage', "No source actions available"),
			{
				include: CodeActionKind.Source.contains(args.kind) ? args.kind : CodeActionKind.None,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply, undefined, CodeActionTriggerSource.SourceAction);
	}
}

export class OrganizeImportsAction extends EditorAction {

	constructor() {
		super({
			id: organizeImportsCommandId,
			label: nls.localize('organizeImports.label', "Organize Imports"),
			alias: 'Organize Imports',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceOrganizeImports)),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
				weight: KeybindingWeight.EditorContrib
			},
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.organize.noneMessage', "No organize imports action available"),
			{ include: CodeActionKind.SourceOrganizeImports, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.OrganizeImports);
	}
}

export class FixAllAction extends EditorAction {

	constructor() {
		super({
			id: fixAllCommandId,
			label: nls.localize('fixAll.label', "Fix All"),
			alias: 'Fix All',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceFixAll))
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('fixAll.noneMessage', "No fix all action available"),
			{ include: CodeActionKind.SourceFixAll, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.FixAll);
	}
}

export class AutoFixAction extends EditorAction {

	static readonly Id = 'editor.action.autoFix';

	constructor() {
		super({
			id: AutoFixAction.Id,
			label: nls.localize('autoFix.label', "Auto Fix..."),
			alias: 'Auto Fix...',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.QuickFix)),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Period,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period
				},
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.autoFix.noneMessage', "No auto fixes available"),
			{
				include: CodeActionKind.QuickFix,
				onlyIncludePreferredActions: true
			},
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.AutoFix);
	}
}

const CodeActionContribution = EditorCommand.bindToContribution<QuickFixController>(QuickFixController.get);

const weight = KeybindingWeight.EditorContrib + 90;

registerEditorCommand(new CodeActionContribution({
	id: 'hideCodeActionMenuWidget',
	precondition: Context.Visible,
	handler(x) {
		x.hideCodeActionMenu();
	},
	kbOpts: {
		weight: weight,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new CodeActionContribution({
	id: 'focusPreviousCodeAction',
	precondition: Context.Visible,
	handler(x) {
		x.navigateCodeActionList(true);
	},
	kbOpts: {
		weight: weight + 100000,
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
	}
}));

registerEditorCommand(new CodeActionContribution({
	id: 'focusNextCodeAction',
	precondition: Context.Visible,
	handler(x) {
		x.navigateCodeActionList(false);
	},
	kbOpts: {
		weight: weight + 100000,
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
	}
}));

registerEditorCommand(new CodeActionContribution({
	id: 'onEnterSelectCodeAction',
	precondition: Context.Visible,
	handler(x) {
		x.selectedOption();
	},
	kbOpts: {
		weight: weight + 100000,
		primary: KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.Period],
	}
}));

registerEditorCommand(new CodeActionContribution({
	id: 'onEnterSelectCodeActionWithPreview',
	precondition: Context.Visible,
	handler(x) {
		x.selectedOptionWithPreview();
	},
	kbOpts: {
		weight: weight + 100000,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	}
}));


