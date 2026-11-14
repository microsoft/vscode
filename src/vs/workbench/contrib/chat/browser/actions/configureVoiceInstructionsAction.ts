/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2, localize } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { COPILOT_CONFIG_FOLDER, DICTATION_INSTRUCTIONS_FILENAME, GITHUB_CONFIG_FOLDER, VOICE_INSTRUCTIONS_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';

export const CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.configureVoiceInstructions';
export const CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.configureDictationInstructions';

interface IVoiceInstructionsQuickPickItem extends IQuickPickItem {
	readonly resource: URI;
}

class ConfigureSpeechInstructionsAction extends Action2 {

	constructor(id: string, title: ReturnType<typeof localize2>, private readonly fileName: string) {
		super({
			id,
			title,
			precondition: ChatContextKeys.enabled,
			f1: false,
			menu: {
				id: MenuId.CommandPalette,
				when: ChatContextKeys.enabled,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const pathService = accessor.get(IPathService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const workspaceTrustService = accessor.get(IWorkspaceTrustManagementService);
		const quickInputService = accessor.get(IQuickInputService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);

		const userHome = await pathService.userHome();
		const items: IVoiceInstructionsQuickPickItem[] = [{
			label: localize('userSpeechInstructions', "User"),
			description: `~/.copilot/${this.fileName}`,
			detail: localize('userSpeechInstructionsDetail', "Applies across all workspaces."),
			resource: joinPath(userHome, COPILOT_CONFIG_FOLDER, this.fileName),
		}];

		const workspaceFolders = workspaceContextService.getWorkspace().folders;
		if (workspaceTrustService.isWorkspaceTrusted()) {
			for (const folder of workspaceFolders) {
				items.push({
					label: workspaceFolders.length === 1
						? localize('workspaceSpeechInstructions', "Workspace")
						: localize('workspaceSpeechInstructionsNamed', "Workspace: {0}", folder.name),
					description: `.github/${this.fileName}`,
					detail: localize('workspaceSpeechInstructionsDetail', "Applies to this workspace and can be shared with your team."),
					resource: joinPath(folder.uri, GITHUB_CONFIG_FOLDER, this.fileName),
				});
			}
		}

		const selected = await quickInputService.pick(items, {
			placeHolder: workspaceFolders.length > 0 && !workspaceTrustService.isWorkspaceTrusted()
				? localize('selectSpeechInstructionsTargetUntrusted', "Select where to configure {0}. Trust the workspace to configure workspace instructions.", this.fileName)
				: localize('selectSpeechInstructionsTarget', "Select where to configure {0}", this.fileName),
			matchOnDescription: true,
			matchOnDetail: true,
		});
		if (!selected) {
			return;
		}

		if (!await fileService.exists(selected.resource)) {
			await fileService.createFolder(dirname(selected.resource));
			await fileService.createFile(selected.resource);
		}
		await editorService.openEditor({ resource: selected.resource });
	}
}

export function registerConfigureSpeechInstructionsActions(): void {
	registerAction2(class extends ConfigureSpeechInstructionsAction {
		constructor() {
			super(
				CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID,
				localize2('configureVoiceInstructions', "Voice: Configure Voice Mode Instructions"),
				VOICE_INSTRUCTIONS_FILENAME,
			);
		}
	});
	registerAction2(class extends ConfigureSpeechInstructionsAction {
		constructor() {
			super(
				CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID,
				localize2('configureDictationInstructions', "Voice: Configure Dictation Instructions"),
				DICTATION_INSTRUCTIONS_FILENAME,
			);
		}
	});
}
