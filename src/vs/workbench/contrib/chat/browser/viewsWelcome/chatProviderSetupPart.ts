/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';

const $ = dom.$;

type ChatProviderSetupClassification = {
	owner: 'eli-w-king';
	comment: 'Tracks which AI provider a signed-out user chooses from the chat panel setup list.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider row that was activated.' };
};

type ChatProviderSetupEvent = {
	provider: string;
};

interface IChatProviderRow {
	readonly id: string;
	/** Set for providers that ship a brand mark instead of a codicon. */
	readonly markClass?: string;
	readonly icon?: ThemeIcon;
	readonly name: string;
	readonly description: string;
	readonly actionLabel: string;
	readonly primary?: boolean;
	readonly commandId: string;
}

export interface IChatProviderSetupOptions {
	/**
	 * Renders a close affordance. Surfaces with no other way past the panel —
	 * the Agents window composer — need one; the editor sidebar reveals its
	 * input as soon as a provider exists.
	 */
	readonly showDismiss?: boolean;
}

/**
 * The signed-out chat panel. Instead of a single "Sign In" call to action that
 * hides every other way of working, this lists the ways to get models and lets
 * the user pick one without leaving chat.
 *
 * The list adapts to the width it is given: a narrow sidebar stacks the rows,
 * a wide composer lays them out side by side. Both come from the same DOM, so
 * there is one structure to reason about rather than two layouts to sync.
 */
export class ChatProviderSetupPart extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	constructor(
		private readonly options: IChatProviderSetupOptions,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.element = $('.chat-provider-setup');
		this.render();
	}

	private render(): void {
		const intro = dom.append(this.element, $('.chat-provider-setup-intro'));
		const heading = dom.append(intro, $('.chat-provider-setup-heading'));
		const title = dom.append(heading, $('h2.chat-provider-setup-title'));
		title.textContent = localize('chat.providerSetup.title', "Choose how to get models");
		const subtitle = dom.append(heading, $('p.chat-provider-setup-subtitle'));
		subtitle.textContent = localize('chat.providerSetup.subtitle', "Pick a provider to start chatting. You can add more later.");

		if (this.options.showDismiss) {
			const dismiss = dom.append(intro, $<HTMLButtonElement>('button.chat-provider-setup-dismiss'));
			dismiss.type = 'button';
			dismiss.appendChild(renderIcon(Codicon.close));
			dismiss.setAttribute('aria-label', localize('chat.providerSetup.dismiss.aria', "Dismiss provider setup"));
			dismiss.title = localize('chat.providerSetup.dismiss', "Dismiss");
			this._register(dom.addDisposableListener(dismiss, dom.EventType.CLICK, () => {
				this._onDidDismiss.fire();
			}));
		}

		const list = dom.append(this.element, $('.chat-provider-setup-list'));
		list.setAttribute('role', 'group');
		list.setAttribute('aria-label', localize('chat.providerSetup.list.aria', "Ways to get models"));

		const rows: IChatProviderRow[] = [
			{
				id: 'copilot',
				icon: Codicon.github,
				name: localize('chat.providerSetup.copilot.name', "GitHub Copilot"),
				description: localize('chat.providerSetup.copilot.description', "Free with your GitHub account."),
				actionLabel: localize('chat.providerSetup.copilot.action', "Sign in"),
				primary: true,
				commandId: CHAT_SETUP_ACTION_ID,
			},
			{
				id: 'chatgpt',
				markClass: 'openai',
				name: localize('chat.providerSetup.chatgpt.name', "ChatGPT"),
				description: localize('chat.providerSetup.chatgpt.description', "Use your OpenAI account or key."),
				// Not "Sign in": there is no OpenAI OAuth here, this opens the
				// model manager where an account or key is added. The label
				// should name what actually happens.
				actionLabel: localize('chat.providerSetup.chatgpt.action', "Set up"),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
			{
				id: 'byok',
				icon: Codicon.key,
				name: localize('chat.providerSetup.byok.name', "Your own key"),
				description: localize('chat.providerSetup.byok.description', "Anthropic, Azure, OpenRouter."),
				actionLabel: localize('chat.providerSetup.byok.action', "Configure"),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
		];

		for (const row of rows) {
			this.renderRow(list, row);
		}

		status(localize('chat.providerSetup.aria.status', "Choose how to get models. {0} options available.", rows.length));
	}

	private renderRow(list: HTMLElement, descriptor: IChatProviderRow): void {
		const row = dom.append(list, $('.chat-provider-setup-row'));
		row.classList.toggle('primary', !!descriptor.primary);

		const mark = dom.append(row, $('span.chat-provider-setup-mark'));
		if (descriptor.markClass) {
			mark.classList.add(descriptor.markClass);
		} else if (descriptor.icon) {
			mark.appendChild(renderIcon(descriptor.icon));
		}
		mark.setAttribute('aria-hidden', 'true');

		const copy = dom.append(row, $('.chat-provider-setup-copy'));
		const name = dom.append(copy, $('span.chat-provider-setup-name'));
		name.textContent = descriptor.name;
		const description = dom.append(copy, $('span.chat-provider-setup-description'));
		description.textContent = descriptor.description;

		const action = dom.append(row, $<HTMLButtonElement>('button.chat-provider-setup-action'));
		action.type = 'button';
		action.classList.toggle('primary', !!descriptor.primary);
		action.textContent = descriptor.actionLabel;
		action.setAttribute('aria-label', localize('chat.providerSetup.action.aria', "{0} — {1}", descriptor.name, descriptor.actionLabel));

		this._register(dom.addDisposableListener(action, dom.EventType.CLICK, () => {
			this.telemetryService.publicLog2<ChatProviderSetupEvent, ChatProviderSetupClassification>('chat.providerSetup.selected', { provider: descriptor.id });
			this.commandService.executeCommand(descriptor.commandId);
		}));
	}
}
