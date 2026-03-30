/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatToolInvocation, type IChatTerminalToolInvocationData } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';

export class ChatMissingSandboxDepsConfirmationSubPart extends AbstractToolConfirmationSubPart {
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		_terminalData: IChatTerminalToolInvocationData,
		context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
	) {
		super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);

		this.render({
			allowActionId: AcceptToolConfirmationActionId,
			skipActionId: SkipToolConfirmationActionId,
			allowLabel: localize('missingDeps.install', "Install"),
			skipLabel: localize('missingDeps.cancel', "Cancel"),
			partType: 'chatMissingSandboxDepsConfirmation',
		});
	}

	protected override createContentElement(): HTMLElement {
		const state = this.toolInvocation.state.get();
		const message = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
			? state.confirmationMessages?.message
			: undefined;

		const container = dom.$('.chat-missing-sandbox-deps-confirmation');
		if (message) {
			const mdMessage = typeof message === 'string' ? new MarkdownString(message) : message;
			const rendered = this.renderer.render(mdMessage);
			this._register(rendered);
			container.appendChild(rendered.element);
		}
		return container;
	}

	protected override getTitle(): string {
		const state = this.toolInvocation.state.get();
		if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title) {
			return typeof state.confirmationMessages.title === 'string'
				? state.confirmationMessages.title
				: state.confirmationMessages.title.value;
		}
		return '';
	}
}
