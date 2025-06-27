/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/promptCloudActionOverlay.css';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { getPromptCommandName } from '../../common/promptSyntax/service/promptsServiceImpl.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { $ } from '../../../../../base/browser/dom.js';

export class PromptCloudActionOverlayWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'promptCloudActionOverlay';

	private readonly _domNode: HTMLElement;
	private readonly _button: Button;
	private _isVisible: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IRemoteCodingAgentsService private readonly _remoteCodingAgentService: IRemoteCodingAgentsService
	) {
		super();

		// Create DOM structure
		this._domNode = $('.prompt-cloud-action-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.zIndex = '10';
		this._domNode.style.padding = '8px';

		// Create button
		this._button = this._register(new Button(this._domNode, {
			...defaultButtonStyles,
			supportIcons: true,
			title: localize('runPromptInCloud', "Run with Coding Agent")
		}));

		this._button.label = localize('runPromptInCloud', "Run with Coding Agent");

		// Handle button click
		this._register(this._button.onDidClick(async () => {
			await this._run();
		}));

		// Listen for context changes to show/hide the widget
		this._register(this._contextKeyService.onDidChangeContext(() => {
			this._updateVisibility();
		}));

		// Listen for model changes to show/hide the widget
		this._register(this._editor.onDidChangeModel(() => {
			this._updateVisibility();
		}));

		// Update initial visibility
		this._updateVisibility();
	}

	getId(): string {
		return PromptCloudActionOverlayWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		if (!this._isVisible) {
			return null;
		}

		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}

	private _updateVisibility(): void {
		const hasRemoteCodingAgent = ChatContextKeys.hasRemoteCodingAgent.getValue(this._contextKeyService);
		const model = this._editor.getModel();
		const isPromptFile = model?.getLanguageId() === PROMPT_LANGUAGE_ID;
		const shouldBeVisible = !!(hasRemoteCodingAgent && isPromptFile);

		if (shouldBeVisible !== this._isVisible) {
			this._isVisible = shouldBeVisible;

			if (this._isVisible) {
				this._editor.addOverlayWidget(this);
			} else {
				this._editor.removeOverlayWidget(this);
			}
		}
	}

	private async _run(): Promise<void> {
		try {
			const model = this._editor.getModel();
			if (!model) {
				return;
			}

			const promptContent = model.getValue();
			const promptName = getPromptCommandName(model.uri.path);

			const agents = this._remoteCodingAgentService.getAvailableAgents();
			const agent = agents[0]; // Use the first available agent
			if (!agent) {
				return;
			}

			// Execute the remote agent command with the prompt content
			await this._commandService.executeCommand(agent.command, {
				userPrompt: promptContent,
				summary: promptName,
			});

		} catch (error) {
			console.error('Failed to run prompt in cloud:', error);
		}
	}

	override dispose(): void {
		if (this._isVisible) {
			this._editor.removeOverlayWidget(this);
		}
		super.dispose();
	}
}
