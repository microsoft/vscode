/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { AICustomizationItemMenuId, AI_CUSTOMIZATION_VIEW_ID } from './aiCustomizationTreeView.js';
import { AICustomizationItemTypeContextKey, AICustomizationViewPane } from './aiCustomizationTreeViewViews.js';
import { AI_CUSTOMIZATION_OVERVIEW_VIEW_ID, AICustomizationOverviewView } from './aiCustomizationOverviewView.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatViewContainerId } from '../chat.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry } from '../../../../common/views.js';

//#region View Registration

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const chatViewContainer = viewContainerRegistry.get(ChatViewContainerId);

if (chatViewContainer) {
	viewsRegistry.registerViews([
		{
			id: AI_CUSTOMIZATION_VIEW_ID,
			name: localize2('aiCustomization.view', "AI Customizations"),
			ctorDescriptor: new SyncDescriptor(AICustomizationViewPane),
			canToggleVisibility: true,
			canMoveView: true,
			when: ChatContextKeys.enabled,
			order: 100,
		},
		{
			id: AI_CUSTOMIZATION_OVERVIEW_VIEW_ID,
			name: localize2('aiCustomizationOverview.view', "AI Customizations Overview"),
			ctorDescriptor: new SyncDescriptor(AICustomizationOverviewView),
			canToggleVisibility: true,
			canMoveView: true,
			when: ChatContextKeys.enabled,
			order: 101,
		},
	], chatViewContainer);
}

//#endregion

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

// Register context menu items
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

//#endregion
