/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../workbench/browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import {
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID,
	AICustomizationManagementCommands,
	AICustomizationManagementItemMenuId,
} from './aiCustomizationManagement.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { basename } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWindows, isMacintosh } from '../../../../base/common/platform.js';

//#region Editor Registration

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AICustomizationManagementEditor,
		AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
		localize('aiCustomizationManagementEditor', "AI Customizations Editor")
	),
	[
		// Note: Using the class directly since we use a singleton pattern
		new SyncDescriptor(AICustomizationManagementEditorInput as unknown as { new(): AICustomizationManagementEditorInput })
	]
);

//#endregion

//#region Editor Serializer

class AICustomizationManagementEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof AICustomizationManagementEditorInput;
	}

	serialize(input: AICustomizationManagementEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): AICustomizationManagementEditorInput {
		return AICustomizationManagementEditorInput.getOrCreate();
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID,
	AICustomizationManagementEditorInputSerializer
);

//#endregion

//#region Context Menu Actions

/**
 * Type for context passed to actions from list context menus.
 * Handles both direct URI arguments and serialized context objects.
 */
type AICustomizationContext = {
	uri: URI | string;
	name?: string;
	promptType?: PromptsType;
	storage?: PromptsStorage;
	[key: string]: unknown;
} | URI | string;

/**
 * Extracts a URI from various context formats.
 */
function extractURI(context: AICustomizationContext): URI {
	if (URI.isUri(context)) {
		return context;
	}
	if (typeof context === 'string') {
		return URI.parse(context);
	}
	if (URI.isUri(context.uri)) {
		return context.uri;
	}
	return URI.parse(context.uri as string);
}

/**
 * Extracts storage type from context.
 */
function extractStorage(context: AICustomizationContext): PromptsStorage | undefined {
	if (URI.isUri(context) || typeof context === 'string') {
		return undefined;
	}
	return context.storage;
}

// Open file action
const OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID = 'aiCustomizationManagement.openFile';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID,
			title: localize2('open', "Open"),
			icon: Codicon.goToFile,
		});
	}
	async run(accessor: ServicesAccessor, context: AICustomizationContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({
			resource: extractURI(context)
		});
	}
});


// Run prompt action
const RUN_PROMPT_MGMT_ID = 'aiCustomizationManagement.runPrompt';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUN_PROMPT_MGMT_ID,
			title: localize2('runPrompt', "Run Prompt"),
			icon: Codicon.play,
		});
	}
	async run(accessor: ServicesAccessor, context: AICustomizationContext): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.chat.run.prompt.current', extractURI(context));
	}
});

// Reveal in Finder/Explorer action
const REVEAL_IN_OS_LABEL = isWindows
	? localize2('revealInWindows', "Reveal in File Explorer")
	: isMacintosh
		? localize2('revealInMac', "Reveal in Finder")
		: localize2('openContainer', "Open Containing Folder");

const REVEAL_AI_CUSTOMIZATION_IN_OS_ID = 'aiCustomizationManagement.revealInOS';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID,
			title: REVEAL_IN_OS_LABEL,
			icon: Codicon.folderOpened,
		});
	}
	async run(accessor: ServicesAccessor, context: AICustomizationContext): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const uri = extractURI(context);
		// Use existing reveal command
		await commandService.executeCommand('revealFileInOS', uri);
	}
});

// Delete action
const DELETE_AI_CUSTOMIZATION_ID = 'aiCustomizationManagement.delete';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DELETE_AI_CUSTOMIZATION_ID,
			title: localize2('delete', "Delete"),
			icon: Codicon.trash,
		});
	}
	async run(accessor: ServicesAccessor, context: AICustomizationContext): Promise<void> {
		const fileService = accessor.get(IFileService);
		const dialogService = accessor.get(IDialogService);

		const uri = extractURI(context);
		const fileName = basename(uri);
		const storage = extractStorage(context);

		// Extension files cannot be deleted
		if (storage === PromptsStorage.extension) {
			await dialogService.info(
				localize('cannotDeleteExtension', "Cannot Delete Extension File"),
				localize('cannotDeleteExtensionDetail', "Files provided by extensions cannot be deleted. You can disable the extension if you no longer want to use this customization.")
			);
			return;
		}

		// Confirm deletion
		const confirmation = await dialogService.confirm({
			message: localize('confirmDelete', "Are you sure you want to delete '{0}'?", fileName),
			detail: localize('confirmDeleteDetail', "This action cannot be undone."),
			primaryButton: localize('delete', "Delete"),
			type: 'warning',
		});

		if (confirmation.confirmed) {
			await fileService.del(uri, { useTrash: true });
		}
	}
});

// Context Key for prompt type to conditionally show "Run Prompt"
const AI_CUSTOMIZATION_ITEM_TYPE_KEY = 'aiCustomizationManagementItemType';

// Register context menu items
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
	command: { id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID, title: localize('open', "Open") },
	group: '1_open',
	order: 1,
});

MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
	command: { id: RUN_PROMPT_MGMT_ID, title: localize('runPrompt', "Run Prompt"), icon: Codicon.play },
	group: '2_run',
	order: 1,
	when: ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.prompt),
});

MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
	command: { id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID, title: REVEAL_IN_OS_LABEL.value },
	group: '3_file',
	order: 1,
	when: ContextKeyExpr.or(
		ContextKeyExpr.regex('aiCustomizationManagementItemUri', new RegExp(`^${Schemas.file}:`)),
		ContextKeyExpr.regex('aiCustomizationManagementItemUri', new RegExp(`^${Schemas.vscodeUserData}:`))
	),
});

MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
	command: { id: DELETE_AI_CUSTOMIZATION_ID, title: localize('delete', "Delete") },
	group: '4_modify',
	order: 1,
});

//#endregion

//#region Actions

class AICustomizationManagementActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.aiCustomizationManagementActions';

	constructor() {
		super();
		this.registerActions();
	}

	private registerActions(): void {
		// Open AI Customizations Editor
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: AICustomizationManagementCommands.OpenEditor,
					title: localize2('openAICustomizations', "Open AI Customizations"),
					category: CHAT_CATEGORY,
					precondition: ChatContextKeys.enabled,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const editorGroupsService = accessor.get(IEditorGroupsService);
				const input = AICustomizationManagementEditorInput.getOrCreate();
				await editorGroupsService.activeGroup.openEditor(input, { pinned: true });
			}
		}));
	}
}

registerWorkbenchContribution2(
	AICustomizationManagementActionsContribution.ID,
	AICustomizationManagementActionsContribution,
	WorkbenchPhase.AfterRestored
);

//#endregion
