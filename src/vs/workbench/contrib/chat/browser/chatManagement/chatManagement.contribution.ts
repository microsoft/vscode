/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ProductQualityContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatManagementEditor, ModelsManagementEditor } from './chatManagementEditor.js';
import { ChatManagementEditorInput, ModelsManagementEditorInput } from './chatManagementEditorInput.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatManagementEditor,
		ChatManagementEditor.ID,
		localize('chatManagementEditor', "Chat Management Editor")
	),
	[
		new SyncDescriptor(ChatManagementEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ModelsManagementEditor,
		ModelsManagementEditor.ID,
		localize('modelsManagementEditor', "Models Management Editor")
	),
	[
		new SyncDescriptor(ModelsManagementEditorInput)
	]
);

class ChatManagementEditorInputSerializer implements IEditorSerializer {

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

class ModelsManagementEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: ModelsManagementEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): ModelsManagementEditorInput {
		return instantiationService.createInstance(ModelsManagementEditorInput);
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatManagementEditorInput.ID, ChatManagementEditorInputSerializer);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ModelsManagementEditorInput.ID, ModelsManagementEditorInputSerializer);

interface IOpenManageCopilotEditorActionOptions {
	query?: string;
	section?: string;
}

function sanitizeString(arg: unknown): string | undefined {
	return isString(arg) ? arg : undefined;
}

function sanitizeOpenManageCopilotEditorArgs(input: unknown): IOpenManageCopilotEditorActionOptions {
	if (!isObject(input)) {
		input = {};
	}

	const args = <IOpenManageCopilotEditorActionOptions>input;

	return {
		query: sanitizeString(args?.query),
		section: sanitizeString(args?.section)
	};
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: MANAGE_CHAT_COMMAND_ID,
			title: localize2('openAiManagement', "Manage Language Models"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatContextKeys.enabled, ContextKeyExpr.or(
				ChatContextKeys.Entitlement.planFree,
				ChatContextKeys.Entitlement.planPro,
				ChatContextKeys.Entitlement.planProPlus,
				ChatContextKeys.Entitlement.internal
			)),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor, args: string | IOpenManageCopilotEditorActionOptions) {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		args = sanitizeOpenManageCopilotEditorArgs(args);
		return editorGroupsService.activeGroup.openEditor(new ModelsManagementEditorInput());
	}
});
