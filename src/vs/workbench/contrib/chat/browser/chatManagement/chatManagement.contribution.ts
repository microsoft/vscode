/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatManagementEditor } from './chatManagementEditor.js';
import { ChatManagementEditorInput } from './chatManagementEditorInput.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatManagementEditor,
		ChatManagementEditor.ID,
		localize('aiManagementEditor', "AI Management Editor")
	),
	[
		new SyncDescriptor(ChatManagementEditorInput)
	]
);

class AiManagementEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: ChatManagementEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): ChatManagementEditorInput {
		return instantiationService.createInstance(ChatManagementEditorInput);
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatManagementEditorInput.ID, AiManagementEditorInputSerializer);


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.manage.copilot',
			title: {
				...localize2('openAiManagement', "Manage Copilot"),
				mnemonicTitle: localize({ key: 'miManageCopilot', comment: ['&& denotes a mnemonic'] }, "Manage &&Copilot"),
			},
			shortTitle: localize2('manageCopilotShort', "Copilot"),
			category: CHAT_CATEGORY,
			f1: true,
			menu: [
				{
					id: MenuId.GlobalActivity,
					group: '2_configuration',
					order: 5,
				},
				{
					id: MenuId.ChatTitleBarMenu,
					group: 'y_manage',
					order: 1,
				}
			]
		});
	}
	run(accessor: ServicesAccessor) {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		return editorGroupsService.activeGroup.openEditor(new ChatManagementEditorInput());
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	command: {
		id: 'workbench.action.manage.copilot',
		title: localize('manageCopilotShort', "Copilot"),
	},
	group: '2_configuration',
	order: 5
});
