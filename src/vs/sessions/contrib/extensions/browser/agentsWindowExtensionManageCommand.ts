/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';

/**
 * The Manage Extension command of the Agents window: shows the extension's page in the Extensions section of Agent
 * Customizations, or searches for it there when it isn't installed. When the Agents window doesn't manage extensions,
 * it says so instead.
 */
export async function manageExtension(accessor: ServicesAccessor, extensionId: string): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);
	const editorService = accessor.get(IEditorService);
	const notificationService = accessor.get(INotificationService);

	if (configurationService.getValue<boolean>(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT)) {
		await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Extensions);
		const section = editorService.activeEditorPane instanceof AICustomizationManagementEditor ? editorService.activeEditorPane.getActiveSectionWidget() : undefined;
		if (section?.showExtension) {
			section.showExtension(extensionId);
			return;
		}
	}

	notificationService.info(localize('agentsWindowExtensions.cannotManage', "Extension '{0}' can't be managed in this window right now.", extensionId));
}
