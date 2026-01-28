/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CONTEXT_MODELS_EDITOR, CONTEXT_MODELS_SEARCH_FOCUS, MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatManagementEditor, ModelsManagementEditor } from './chatManagementEditor.js';
import { ChatManagementEditorInput, ModelsManagementEditorInput } from './chatManagementEditorInput.js';
import { ILanguageModelsConfigurationService } from '../../common/languageModelsConfiguration.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';

const languageModelsOpenSettingsIcon = registerIcon('language-models-open-settings', Codicon.goToFile, localize('languageModelsOpenSettings', 'Icon for open language models settings commands.'));

const LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(
	ChatContextKeys.Entitlement.planFree,
	ChatContextKeys.Entitlement.planPro,
	ChatContextKeys.Entitlement.planProPlus,
	ChatContextKeys.Entitlement.planBusiness,
	ChatContextKeys.Entitlement.planEnterprise,
	ChatContextKeys.Entitlement.internal
));

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

class ChatManagementActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatManagementActions';

	constructor(
		@ILanguageModelsConfigurationService private readonly languageModelsConfigurationService: ILanguageModelsConfigurationService,
	) {
		super();
		this.registerChatManagementActions();
		this.registerLanguageModelsEditorTitleActions();
	}

	private registerChatManagementActions() {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: MANAGE_CHAT_COMMAND_ID,
					title: localize2('openAiManagement', "Manage Language Models"),
					category: CHAT_CATEGORY,
					precondition: LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION,
					f1: true,
				});
			}
			async run(accessor: ServicesAccessor, args: string | IOpenManageCopilotEditorActionOptions) {
				const editorGroupsService = accessor.get(IEditorGroupsService);
				args = sanitizeOpenManageCopilotEditorArgs(args);
				return editorGroupsService.activeGroup.openEditor(new ModelsManagementEditorInput(), { pinned: true });
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'chat.models.action.clearSearchResults',
					precondition: CONTEXT_MODELS_EDITOR,
					keybinding: {
						primary: KeyCode.Escape,
						weight: KeybindingWeight.EditorContrib,
						when: CONTEXT_MODELS_SEARCH_FOCUS
					},
					title: localize2('models.clearResults', "Clear Models Search Results")
				});
			}

			run(accessor: ServicesAccessor) {
				const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
				if (activeEditorPane instanceof ModelsManagementEditor) {
					activeEditorPane.clearSearch();
				}
				return null;
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openLanguageModelsJson',
					title: localize2('openLanguageModelsJson', "Open Language Models (JSON)"),
					category: CHAT_CATEGORY,
					precondition: LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor) {
				const languageModelsConfigurationService = accessor.get(ILanguageModelsConfigurationService);
				await languageModelsConfigurationService.configureLanguageModels();
			}
		}));
	}

	private registerLanguageModelsEditorTitleActions() {
		const modelsConfigurationFile = this.languageModelsConfigurationService.configurationFile;
		const openModelsManagementEditorWhen = ContextKeyExpr.and(
			CONTEXT_MODELS_EDITOR.toNegated(),
			ResourceContextKey.Resource.isEqualTo(modelsConfigurationFile.toString()),
			ContextKeyExpr.not('isInDiffEditor'),
			LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION
		);

		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: MANAGE_CHAT_COMMAND_ID,
				title: localize2('openAiManagement', "Manage Language Models"),
				icon: languageModelsOpenSettingsIcon
			},
			when: openModelsManagementEditorWhen,
			group: 'navigation',
			order: 1
		});

		const openLanguageModelsJsonWhen = ContextKeyExpr.and(
			CONTEXT_MODELS_EDITOR,
			LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION
		);

		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: 'workbench.action.openLanguageModelsJson',
				title: localize2('openLanguageModelsJson', "Open Language Models (JSON)"),
				icon: languageModelsOpenSettingsIcon
			},
			when: openLanguageModelsJsonWhen,
			group: 'navigation',
			order: 1
		});
	}
}

registerWorkbenchContribution2(ChatManagementActionsContribution.ID, ChatManagementActionsContribution, WorkbenchPhase.AfterRestored);
