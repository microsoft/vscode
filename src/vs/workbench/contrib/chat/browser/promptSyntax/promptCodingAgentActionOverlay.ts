/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { getPromptCommandName } from '../../common/promptSyntax/service/promptsServiceImpl.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { Action2, MenuId, registerAction2, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AbstractFloatingClickMenu, FloatingClickWidget } from '../../../../../platform/actions/browser/floatingMenu.js';
import { FloatingEditorClickWidget } from '../../../../browser/codeeditor.js';
import { EmbeddedCodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IAction } from '../../../../../base/common/actions.js';
import { localize2 } from '../../../../../nls.js';

export class PromptCodingAgentFloatingMenu extends AbstractFloatingClickMenu {
	static readonly ID = 'editor.contrib.promptCodingAgentFloatingMenu';

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(MenuId.ChatFileEditorContent, menuService, contextKeyService);
		this.render();
	}

	protected override createWidget(action: IAction): FloatingClickWidget {
		return this.instantiationService.createInstance(FloatingEditorClickWidget, this.editor, action.label, action.id);
	}

	protected override isVisible(): boolean {
		const model = this.editor.getModel();
		return !(this.editor instanceof EmbeddedCodeEditorWidget)
			&& this.editor?.hasModel()
			&& !this.editor.getOption(EditorOption.inDiffEditor)
			&& model?.getLanguageId() === PROMPT_LANGUAGE_ID;
	}

	protected override getActionArg(): unknown {
		return this.editor.getModel()?.uri;
	}
}

const PROMPT_CODING_AGENT_ACTION_ID = 'prompt.runWithCodingAgent';

class RunPromptWithCodingAgentAction extends Action2 {
	constructor() {
		super({
			id: PROMPT_CODING_AGENT_ACTION_ID,
			title: localize2('runWithCodingAgent', 'Run with Coding Agent'),
			icon: Codicon.cloudUpload,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.hasRemoteCodingAgent,
				ContextKeyExpr.equals('resourceLangId', PROMPT_LANGUAGE_ID)
			),
			menu: {
				id: MenuId.ChatFileEditorContent,
				when: ContextKeyExpr.and(
					ChatContextKeys.hasRemoteCodingAgent,
					ContextKeyExpr.equals('resourceLangId', PROMPT_LANGUAGE_ID)
				),
				group: 'navigation',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		const remoteCodingAgentService = accessor.get(IRemoteCodingAgentsService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!isCodeEditor(activeEditor)) {
			return;
		}

		const model = activeEditor.getModel();
		if (!model || model.getLanguageId() !== PROMPT_LANGUAGE_ID) {
			return;
		}

		const promptContent = model.getValue();
		const promptName = getPromptCommandName(model.uri.path);

		const agents = remoteCodingAgentService.getAvailableAgents();
		const agent = agents[0]; // Use the first available agent
		if (!agent) {
			return;
		}

		await commandService.executeCommand(agent.command, {
			userPrompt: promptName,
			summary: promptContent,
			source: 'prompt',
		});
	}
}

registerAction2(RunPromptWithCodingAgentAction);
