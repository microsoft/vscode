/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationItemMenuId } from './aiCustomizationTreeView.js';
import { AICustomizationItemTypeContextKey } from './aiCustomizationTreeViewViews.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

//#region Utilities

/**
 * Type for context passed to actions from tree context menus.
 * Handles both direct URI arguments and serialized context objects.
 */
type URIContext = { uri: URI | string;[key: string]: unknown } | URI | string;

/**
 * Extracts a URI from various context formats.
 * Context can be a URI, string, or an object with uri property.
 */
function extractURI(context: URIContext): URI {
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

//#endregion

//#region Context Menu Actions

// Open file action
const OPEN_AI_CUSTOMIZATION_FILE_ID = 'aiCustomization.openFile';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_AI_CUSTOMIZATION_FILE_ID,
			title: localize2('open', "Open"),
			icon: Codicon.goToFile,
		});
	}
	async run(accessor: ServicesAccessor, context: URIContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({
			resource: extractURI(context)
		});
	}
});


// Run prompt action
const RUN_PROMPT_FROM_VIEW_ID = 'aiCustomization.runPrompt';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUN_PROMPT_FROM_VIEW_ID,
			title: localize2('runPrompt', "Run Prompt"),
			icon: Codicon.play,
		});
	}
	async run(accessor: ServicesAccessor, context: URIContext): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.chat.run.prompt.current', extractURI(context));
	}
});

// Delete file action
const DELETE_AI_CUSTOMIZATION_FILE_ID = 'aiCustomization.deleteFile';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DELETE_AI_CUSTOMIZATION_FILE_ID,
			title: localize2('delete', "Delete"),
			icon: Codicon.trash,
		});
	}
	async run(accessor: ServicesAccessor, context: URIContext): Promise<void> {
		const fileService = accessor.get(IFileService);
		const dialogService = accessor.get(IDialogService);
		const uri = extractURI(context);
		const name = typeof context === 'object' && !URI.isUri(context) ? (context as { name?: string }).name ?? '' : '';

		if (uri.scheme !== 'file') {
			return;
		}

		const confirmation = await dialogService.confirm({
			message: localize('confirmDelete', "Are you sure you want to delete '{0}'?", name || uri.path),
			primaryButton: localize('delete', "Delete"),
		});

		if (confirmation.confirmed) {
			await fileService.del(uri, { useTrash: true, recursive: true });
		}
	}
});

// Copy path action
const COPY_AI_CUSTOMIZATION_PATH_ID = 'aiCustomization.copyPath';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: COPY_AI_CUSTOMIZATION_PATH_ID,
			title: localize2('copyPath', "Copy Path"),
			icon: Codicon.clippy,
		});
	}
	async run(accessor: ServicesAccessor, context: URIContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const uri = extractURI(context);
		const textToCopy = uri.scheme === 'file' ? uri.fsPath : uri.toString(true);
		await clipboardService.writeText(textToCopy);
	}
});

// Register context menu items

// Inline hover actions (shown as icon buttons on hover)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
	command: { id: DELETE_AI_CUSTOMIZATION_FILE_ID, title: localize('delete', "Delete"), icon: Codicon.trash },
	group: 'inline',
	order: 10,
});

// Context menu items (shown on right-click)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
	command: { id: OPEN_AI_CUSTOMIZATION_FILE_ID, title: localize('open', "Open") },
	group: '1_open',
	order: 1,
});

MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
	command: { id: RUN_PROMPT_FROM_VIEW_ID, title: localize('runPrompt', "Run Prompt"), icon: Codicon.play },
	group: '2_run',
	order: 1,
	when: ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.prompt),
});

MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
	command: { id: COPY_AI_CUSTOMIZATION_PATH_ID, title: localize('copyPath', "Copy Path") },
	group: '3_modify',
	order: 1,
});

MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
	command: { id: DELETE_AI_CUSTOMIZATION_FILE_ID, title: localize('delete', "Delete") },
	group: '3_modify',
	order: 10,
});

//#endregion
