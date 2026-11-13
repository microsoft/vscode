/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, MANAGE_EXTENSION_COMMAND_ID } from '../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';

/**
 * Registers the Manage Extension command of the Agents window, which shows the extension's page in the Extensions
 * section of Agent Customizations, or searches for it there when it isn't installed, while that section is enabled. Otherwise the command is missing, and notifications
 * and status bar items don't offer Manage Extension.
 */
export class AgentsWindowExtensionManageCommand extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsWindowExtensionManageCommand';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const enabled = observableConfigValue<boolean>(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, false, configurationService);
		const command = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			command.value = enabled.read(reader) ? CommandsRegistry.registerCommand(MANAGE_EXTENSION_COMMAND_ID, manageExtension) : undefined;
		}));
	}
}

async function manageExtension(accessor: ServicesAccessor, extensionId: string): Promise<void> {
	const commandService = accessor.get(ICommandService);
	const editorService = accessor.get(IEditorService);

	await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Extensions);
	const pane = editorService.activeEditorPane;
	if (pane instanceof AICustomizationManagementEditor) {
		pane.getActiveSectionWidget()?.showExtension?.(extensionId);
	}
}
