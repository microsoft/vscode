/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { $ } from '../../../../../base/browser/dom.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

export class PromptCodingAgentActionOverlayWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'promptCodingAgentActionOverlay';

	private readonly _domNode: HTMLElement;
	private readonly _button: Button;
	private _isVisible: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IRemoteCodingAgentsService private readonly _remoteCodingAgentService: IRemoteCodingAgentsService,
		@IPromptsService private readonly _promptsService: IPromptsService,
	) {
		super();

		this._domNode = $('.prompt-coding-agent-action-overlay');

		this._button = this._register(new Button(this._domNode, {
			supportIcons: true,
			title: localize('runPromptWithCodingAgent', "Run prompt file in a remote coding agent")
		}));

		this._button.element.style.background = 'var(--vscode-button-background)';
		this._button.element.style.color = 'var(--vscode-button-foreground)';
		this._button.label = localize('runWithCodingAgent.label', "{0} Delegate to Copilot coding agent", '$(cloud-upload)');

		this._register(this._button.onDidClick(async () => {
			await this._execute();
		}));
		this._register(this._contextKeyService.onDidChangeContext(() => {
			this._updateVisibility();
		}));
		this._register(this._editor.onDidChangeModel(() => {
			this._updateVisibility();
		}));
		this._register(this._editor.onDidLayoutChange(() => {
			if (this._isVisible) {
				this._editor.layoutOverlayWidget(this);
			}
		}));

		// initial visibility
		this._updateVisibility();
	}

	getId(): string {
		return PromptCodingAgentActionOverlayWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		if (!this._isVisible) {
			return null;
		}

		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER,
		};
	}

	private _updateVisibility(): void {
		const enableRemoteCodingAgentPromptFileOverlay = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(this._contextKeyService);
		const hasRemoteCodingAgent = ChatContextKeys.hasRemoteCodingAgent.getValue(this._contextKeyService);
		const model = this._editor.getModel();
		const isPromptFile = model?.getLanguageId() === PROMPT_LANGUAGE_ID;
		const shouldBeVisible = !!(isPromptFile && enableRemoteCodingAgentPromptFileOverlay && hasRemoteCodingAgent);

		if (shouldBeVisible !== this._isVisible) {
			this._isVisible = shouldBeVisible;
			if (this._isVisible) {
				this._editor.addOverlayWidget(this);
			} else {
				this._editor.removeOverlayWidget(this);
			}
		}
	}

	private async _execute(): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		this._button.enabled = false;
		try {
			const promptContent = model.getValue();
			const promptName = await this._promptsService.getPromptSlashCommandName(model.uri, CancellationToken.None);

			const agents = this._remoteCodingAgentService.getAvailableAgents();
			const agent = agents[0]; // Use the first available agent
			if (!agent) {
				return;
			}

			await this._commandService.executeCommand(agent.command, {
				userPrompt: promptName,
				summary: promptContent,
				source: 'prompt',
			});
		} finally {
			this._button.enabled = true;
		}
	}

	override dispose(): void {
		if (this._isVisible) {
			this._editor.removeOverlayWidget(this);
		}
		super.dispose();
	}
}
