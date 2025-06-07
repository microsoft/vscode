/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatViewId, IChatWidget, IChatWidgetService, showChatView } from '../chat.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextPick, IChatContextPickerItem, IChatContextPickerPickItem } from '../chatContextPickService.js';
import { IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { compare } from '../../../../../base/common/strings.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { dirname } from '../../../../../base/common/resources.js';
import { IPromptFileVariableEntry } from '../../common/chatModel.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

/**
 * Action ID for the `Attach Instruction` action.
 */
const ATTACH_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.attach.instructions';

/**
 * Action ID for the `Configure Instruction` action.
 */
const CONFIGURE_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.configure.instructions';


/**
 * Options for the {@link AttachInstructionsAction} action.
 */
export interface IAttachInstructionsActionOptions {

	/**
	 * Target chat widget reference to attach the instruction to. If the reference is
	 * provided, the command will attach the instruction as attachment of the widget.
	 * Otherwise, the command will re-use an existing one.
	 */
	readonly widget?: IChatWidget;

	/**
	 * Instruction resource `URI` to attach to the chat input, if any.
	 * If provided the resource will be pre-selected in the prompt picker dialog,
	 * otherwise the dialog will show the prompts list without any pre-selection.
	 */
	readonly resource?: URI;

	/**
	 * Whether to skip the instructions files selection dialog.
	 *
	 * Note! if this option is set to `true`, the {@link resource}
	 * option `must be defined`.
	 */
	readonly skipSelectionDialog?: boolean;
}

/**
 * Action to attach a prompt to a chat widget input.
 */
class AttachInstructionsAction extends Action2 {
	constructor() {
		super({
			id: ATTACH_INSTRUCTIONS_ACTION_ID,
			title: localize2('attach-instructions.capitalized.ellipses', "Attach Instructions..."),
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Slash,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
			}
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		options?: IAttachInstructionsActionOptions,
	): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const instaService = accessor.get(IInstantiationService);

		if (!options) {
			options = {
				resource: getActiveInstructionsFileUri(accessor),
				widget: getFocusedChatWidget(accessor),
			};
		}

		const pickers = instaService.createInstance(PromptFilePickers);

		const { skipSelectionDialog, resource } = options;


		const widget = options.widget ?? (await showChatView(viewsService));
		if (!widget) {
			return;
		}

		if (skipSelectionDialog && resource) {
			widget.attachmentModel.promptInstructions.add(resource);
			widget.focusInput();
			return;
		}

		const placeholder = localize(
			'commands.instructions.select-dialog.placeholder',
			'Select instructions files to attach',
		);

		const result = await pickers.selectPromptFile({ resource, placeholder, type: PromptsType.instructions });

		if (result !== undefined) {
			widget.attachmentModel.promptInstructions.add(result.promptFile);
			widget.focusInput();
		}
	}
}

class ManageInstructionsFilesAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_INSTRUCTIONS_ACTION_ID,
			title: localize2('configure-instructions', "Configure Instructions"),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ViewTitle,

				when: ContextKeyExpr.equals('view', ChatViewId),
				order: 11,
				group: '2_manage'
			},

		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		const placeholder = localize(
			'commands.prompt.manage-dialog.placeholder',
			'Select the instructions file to open'
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.instructions, optionEdit: false });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}

	}
}


function getFocusedChatWidget(accessor: ServicesAccessor): IChatWidget | undefined {
	const chatWidgetService = accessor.get(IChatWidgetService);

	const { lastFocusedWidget } = chatWidgetService;
	if (!lastFocusedWidget) {
		return undefined;
	}

	// the widget input `must` be focused at the time when command run
	if (!lastFocusedWidget.hasInputFocus()) {
		return undefined;
	}

	return lastFocusedWidget;
}

/**
 * Gets `URI` of a instructions file open in an active editor instance, if any.
 */
function getActiveInstructionsFileUri(accessor: ServicesAccessor): URI | undefined {
	const codeEditorService = accessor.get(ICodeEditorService);
	const model = codeEditorService.getActiveCodeEditor()?.getModel();
	if (model?.getLanguageId() === INSTRUCTIONS_LANGUAGE_ID) {
		return model.uri;
	}
	return undefined;
}

/**
 * Helper to register the `Attach Prompt` action.
 */
export function registerAttachPromptActions(): void {
	registerAction2(AttachInstructionsAction);
	registerAction2(ManageInstructionsFilesAction);
}


export class ChatInstructionsPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.attach.instructions.label', 'Instructions...');
	readonly icon = Codicon.bookmark;
	readonly commandId = ATTACH_INSTRUCTIONS_ACTION_ID;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILabelService private readonly labelService: ILabelService
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		return widget.attachmentModel.promptInstructions.featureEnabled;
	}

	asPicker(): { readonly placeholder: string; readonly picks: Promise<ChatContextPick[]> } {

		const picks = this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None).then(value => {

			const result: (IChatContextPickerPickItem | IQuickPickSeparator)[] = [];

			value = value.slice(0).sort((a, b) => compare(a.storage, b.storage));

			let storageType: string | undefined;

			for (const { uri, storage } of value) {

				if (storageType !== storage) {
					storageType = storage;
					result.push({
						type: 'separator',
						label: storage === 'user'
							? localize('user-data-dir.capitalized', 'User data folder')
							: this.labelService.getUriLabel(dirname(uri), { relative: true })
					});
				}

				result.push({
					label: getCleanPromptName(uri),
					asAttachment: (): IPromptFileVariableEntry => {
						return {
							kind: 'promptFile',
							id: uri.toString(),
							value: uri,
							name: this.labelService.getUriBasenameLabel(uri),
						};
					}
				});
			}
			return result;
		});

		return {
			placeholder: localize('placeholder', 'Select instructions files to attach'),
			picks
		};
	}

}
