/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { asyncTransaction, transaction } from '../../../../../base/common/observable.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { vBoolean, vObj, vOptionalProp, vString, vUndefined, vUnion, vWithJsonSchemaRef } from '../../../../../base/common/validation.js';
import * as nls from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { EditorAction, ServicesAccessor } from '../../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { InlineCompletionsProvider } from '../../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { Context as SuggestContext } from '../../../suggest/browser/suggest.js';
import { hideInlineCompletionId, inlineSuggestCommitId, jumpToNextInlineEditId, showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId, toggleShowCollapsedId } from './commandIds.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';
import { InlineCompletionsController } from './inlineCompletionsController.js';

export class ShowNextInlineSuggestionAction extends EditorAction {
	public static ID = showNextInlineSuggestionActionId;
	constructor() {
		super({
			id: ShowNextInlineSuggestionAction.ID,
			label: nls.localize2('action.inlineSuggest.showNext', "Show Next Inline Suggestion"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketRight,
			},
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		controller?.model.get()?.next();
	}
}

export class ShowPreviousInlineSuggestionAction extends EditorAction {
	public static ID = showPreviousInlineSuggestionActionId;
	constructor() {
		super({
			id: ShowPreviousInlineSuggestionAction.ID,
			label: nls.localize2('action.inlineSuggest.showPrevious', "Show Previous Inline Suggestion"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketLeft,
			},
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		controller?.model.get()?.previous();
	}
}

export const providerIdSchemaUri = 'vscode://schemas/inlineCompletionProviderIdArgs';

export function inlineCompletionProviderGetMatcher(provider: InlineCompletionsProvider): string[] {
	const result: string[] = [];
	if (provider.providerId) {
		result.push(provider.providerId.toStringWithoutVersion());
		result.push(provider.providerId.extensionId + ':*');
	}
	return result;
}

const argsValidator = vUnion(vObj({
	showNoResultNotification: vOptionalProp(vBoolean()),
	providerId: vOptionalProp(vWithJsonSchemaRef(providerIdSchemaUri, vString())),
	explicit: vOptionalProp(vBoolean()),
}), vUndefined());

export class TriggerInlineSuggestionAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.trigger',
			label: nls.localize2('action.inlineSuggest.trigger', "Trigger Inline Suggestion"),
			precondition: EditorContextKeys.writable,
			metadata: {
				description: nls.localize('inlineSuggest.trigger.description', "Triggers an inline suggestion in the editor."),
				args: [{
					name: 'args',
					description: nls.localize('inlineSuggest.trigger.args', "Options for triggering inline suggestions."),
					isOptional: true,
					schema: argsValidator.getJSONSchema(),
				}]
			}
		});
	}

	public override async run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);

		const controller = InlineCompletionsController.get(editor);

		const validatedArgs = argsValidator.validateOrThrow(args);

		const provider = validatedArgs?.providerId ?
			languageFeaturesService.inlineCompletionsProvider.all(editor.getModel()!)
				.find(p => inlineCompletionProviderGetMatcher(p).some(m => m === validatedArgs.providerId))
			: undefined;

		await asyncTransaction(async tx => {
			/** @description triggerExplicitly from command */
			await controller?.model.get()?.trigger(tx, {
				provider: provider,
				explicit: validatedArgs?.explicit ?? true,
			});
			controller?.playAccessibilitySignal(tx);
		});

		if (validatedArgs?.showNoResultNotification) {
			if (!controller?.model.get()?.state.get()) {
				notificationService.notify({
					severity: Severity.Info,
					message: nls.localize('noInlineSuggestionAvailable', "No inline suggestion is available.")
				});
			}
		}
	}
}

export class AcceptNextWordOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextWord',
			label: nls.localize2('action.inlineSuggest.acceptNextWord', "Accept Next Word Of Inline Suggestion"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.cursorBeforeGhostText, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			},
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('acceptWord', 'Accept Word'),
				group: 'primary',
				order: 2,
			}],
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await controller?.model.get()?.acceptNextWord();
	}
}

export class AcceptNextLineOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextLine',
			label: nls.localize2('action.inlineSuggest.acceptNextLine', "Accept Next Line Of Inline Suggestion"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
			},
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('acceptLine', 'Accept Line'),
				group: 'secondary',
				order: 2,
			}],
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await controller?.model.get()?.acceptNextLine();
	}
}

export class AcceptInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: inlineSuggestCommitId,
			label: nls.localize2('action.inlineSuggest.accept', "Accept Inline Suggestion"),
			precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('accept', "Accept"),
				group: 'primary',
				order: 2,
			}, {
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('accept', "Accept"),
				group: 'primary',
				order: 2,
			}],
			kbOpts: [
				{
					primary: KeyCode.Tab,
					weight: 200,
					kbExpr: ContextKeyExpr.or(
						ContextKeyExpr.and(
							InlineCompletionContextKeys.inlineSuggestionVisible,
							EditorContextKeys.tabMovesFocus.toNegated(),
							SuggestContext.Visible.toNegated(),
							EditorContextKeys.hoverFocused.toNegated(),
							InlineCompletionContextKeys.hasSelection.toNegated(),

							InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize,
						),
						ContextKeyExpr.and(
							InlineCompletionContextKeys.inlineEditVisible,
							EditorContextKeys.tabMovesFocus.toNegated(),
							SuggestContext.Visible.toNegated(),
							EditorContextKeys.hoverFocused.toNegated(),

							InlineCompletionContextKeys.tabShouldAcceptInlineEdit,
						)
					),
				}
			],
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
		if (controller) {
			controller.model.get()?.accept(controller.editor);
			controller.editor.focus();
		}
	}
}
KeybindingsRegistry.registerKeybindingRule({
	id: inlineSuggestCommitId,
	weight: 202, // greater than jump
	primary: KeyCode.Tab,
	when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});

export class JumpToNextInlineEdit extends EditorAction {
	constructor() {
		super({
			id: jumpToNextInlineEditId,
			label: nls.localize2('action.inlineSuggest.jump', "Jump to next inline edit"),
			precondition: InlineCompletionContextKeys.inlineEditVisible,
			menuOpts: [{
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('jump', "Jump"),
				group: 'primary',
				order: 1,
				when: InlineCompletionContextKeys.cursorAtInlineEdit.toNegated(),
			}],
			kbOpts: {
				primary: KeyCode.Tab,
				weight: 201,
				kbExpr: ContextKeyExpr.and(
					InlineCompletionContextKeys.inlineEditVisible,
					EditorContextKeys.tabMovesFocus.toNegated(),
					SuggestContext.Visible.toNegated(),
					EditorContextKeys.hoverFocused.toNegated(),
					InlineCompletionContextKeys.tabShouldJumpToInlineEdit,
				),
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		if (controller) {
			controller.jump();
		}
	}
}

export class HideInlineCompletion extends EditorAction {
	public static ID = hideInlineCompletionId;

	constructor() {
		super({
			id: HideInlineCompletion.ID,
			label: nls.localize2('action.inlineSuggest.hide', "Hide Inline Suggestion"),
			precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 90, // same as hiding the suggest widget
				primary: KeyCode.Escape,
			},
			menuOpts: [{
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('reject', "Reject"),
				group: 'primary',
				order: 3,
			}]
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
		transaction(tx => {
			controller?.model.get()?.stop('explicitCancel', tx);
		});
		controller?.editor.focus();
	}
}

export class ToggleInlineCompletionShowCollapsed extends EditorAction {
	public static ID = toggleShowCollapsedId;

	constructor() {
		super({
			id: ToggleInlineCompletionShowCollapsed.ID,
			label: nls.localize2('action.inlineSuggest.toggleShowCollapsed', "Toggle Inline Suggestions Show Collapsed"),
			precondition: ContextKeyExpr.true(),
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const showCollapsed = configurationService.getValue<boolean>('editor.inlineSuggest.edits.showCollapsed');
		configurationService.updateValue('editor.inlineSuggest.edits.showCollapsed', !showCollapsed);
	}
}

KeybindingsRegistry.registerKeybindingRule({
	id: HideInlineCompletion.ID,
	weight: -1, // very weak
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});

export class ToggleAlwaysShowInlineSuggestionToolbar extends Action2 {
	public static ID = 'editor.action.inlineSuggest.toggleAlwaysShowToolbar';

	constructor() {
		super({
			id: ToggleAlwaysShowInlineSuggestionToolbar.ID,
			title: nls.localize('action.inlineSuggest.alwaysShowToolbar', "Always Show Toolbar"),
			f1: false,
			precondition: undefined,
			menu: [{
				id: MenuId.InlineSuggestionToolbar,
				group: 'secondary',
				order: 10,
			}],
			toggled: ContextKeyExpr.equals('config.editor.inlineSuggest.showToolbar', 'always')
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const currentValue = configService.getValue<'always' | 'onHover'>('editor.inlineSuggest.showToolbar');
		const newValue = currentValue === 'always' ? 'onHover' : 'always';
		configService.updateValue('editor.inlineSuggest.showToolbar', newValue);
	}
}

export class DevExtractReproSample extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.dev.extractRepro',
			label: nls.localize('action.inlineSuggest.dev.extractRepro', "Developer: Extract Inline Suggest State"),
			alias: 'Developer: Inline Suggest Extract Repro',
			precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineEditVisible, InlineCompletionContextKeys.inlineSuggestionVisible),
		});
	}

	public override async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<any> {
		const clipboardService = accessor.get(IClipboardService);

		const controller = InlineCompletionsController.get(editor);
		const m = controller?.model.get();
		if (!m) { return; }
		const repro = m.extractReproSample();

		const inlineCompletionLines = splitLines(JSON.stringify({ inlineCompletion: repro.inlineCompletion }, null, 4));

		const json = inlineCompletionLines.map(l => '// ' + l).join('\n');

		const reproStr = `${repro.documentValue}\n\n// <json>\n${json}\n// </json>\n`;

		await clipboardService.writeText(reproStr);

		return { reproCase: reproStr };
	}
}
