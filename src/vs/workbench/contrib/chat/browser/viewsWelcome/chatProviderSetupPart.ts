/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';

const $ = dom.$;

type ChatProviderSetupClassification = {
	owner: 'eli-w-king';
	comment: 'Tracks which AI providers a signed-out user turns on from the chat panel setup list.';
	providers: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma separated ids of the providers that were switched on.' };
};

type ChatProviderSetupEvent = {
	providers: string;
};

interface IChatProviderRow {
	readonly id: string;
	/** Set for providers that ship a brand mark instead of a codicon. */
	readonly markClass?: string;
	readonly icon?: ThemeIcon;
	readonly name: string;
	readonly description: string;
	readonly commandId: string;
}

/**
 * The signed-out chat surface. Instead of a single "Sign In" call to action
 * that hides every other way of working, this lists the ways to get models.
 *
 * It deliberately mirrors the onboarding modal's sign-in step — the same toggle
 * rows, the same grouped container, Copilot already on — so a user who has seen
 * one recognises the other rather than learning two designs for one decision.
 */
export class ChatProviderSetupPart extends Disposable {

	readonly element: HTMLElement;

	/** Providers switched on; Copilot leads by default. */
	private readonly selected = new Set<string>(['copilot']);
	private continueButton: HTMLButtonElement | undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// While this list is up it is the sign-in affordance, so other prompts
		// for the same thing (the title-bar indicator) stand down.
		const visible = ChatEntitlementContextKeys.Setup.providerListVisible.bindTo(contextKeyService);
		visible.set(true);
		this._register(toDisposable(() => visible.reset()));

		this.element = $('.chat-provider-setup');
		this.render();
	}

	private render(): void {
		const intro = dom.append(this.element, $('.chat-provider-setup-intro'));
		const title = dom.append(intro, $('h2.chat-provider-setup-title'));
		title.textContent = localize('chat.providerSetup.title', "Let's get you set up");
		const subtitle = dom.append(intro, $('p.chat-provider-setup-subtitle'));
		subtitle.textContent = localize('chat.providerSetup.subtitle', "Turn on what you'd like to use. You can add more later.");

		const list = dom.append(this.element, $('.chat-provider-setup-list'));
		list.setAttribute('role', 'group');
		list.setAttribute('aria-label', localize('chat.providerSetup.list.aria', "Ways to get models"));

		for (const row of this.getRows()) {
			this.renderRow(list, row);
		}

		const footer = dom.append(this.element, $('.chat-provider-setup-footer'));
		const button = this.continueButton = dom.append(footer, $<HTMLButtonElement>('button.chat-provider-setup-continue'));
		button.type = 'button';
		this.updateContinueLabel();
		this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => this.runContinue()));

		this.renderInputPreview();

		status(localize('chat.providerSetup.aria.status', "Choose how to get models. GitHub Copilot is selected."));
	}

	/**
	 * A non-interactive impression of the chat input. There is no model yet, so
	 * a real input would invite a message it has to refuse — but with nothing
	 * there at all the panel reads as a settings page rather than the top of a
	 * chat. This is scenery: it shows where the conversation will happen.
	 *
	 * It is inert by construction — a div rather than a text control, no tab
	 * stop, no pointer events — and hidden from assistive technology, because
	 * announcing an input that cannot accept input would be a worse lie to a
	 * screen reader user than showing nothing at all.
	 */
	private renderInputPreview(): void {
		const preview = dom.append(this.element, $('.chat-provider-setup-input-preview'));
		preview.setAttribute('aria-hidden', 'true');

		const placeholder = dom.append(preview, $('span.chat-provider-setup-input-placeholder'));
		placeholder.textContent = localize('chat.providerSetup.inputPreview', "Chat with your AI");

		const send = dom.append(preview, $('span.chat-provider-setup-input-send'));
		send.appendChild(renderIcon(Codicon.arrowUp));
	}

	private getRows(): readonly IChatProviderRow[] {
		return [
			{
				id: 'copilot',
				icon: Codicon.github,
				name: localize('chat.providerSetup.copilot.name', "GitHub Copilot"),
				description: localize('chat.providerSetup.copilot.description', "Free with your GitHub account."),
				commandId: CHAT_SETUP_ACTION_ID,
			},
			{
				id: 'chatgpt',
				markClass: 'openai',
				name: localize('chat.providerSetup.chatgpt.name', "ChatGPT"),
				description: localize('chat.providerSetup.chatgpt.description', "Your OpenAI account or key."),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
			{
				id: 'byok',
				icon: Codicon.key,
				name: localize('chat.providerSetup.byok.name', "Your own key"),
				description: localize('chat.providerSetup.byok.description', "Anthropic, Azure, OpenRouter."),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
		];
	}

	/**
	 * The whole row is the switch's label, so the entire line is a hit target
	 * and the description is announced with the control rather than after it.
	 */
	private renderRow(list: HTMLElement, descriptor: IChatProviderRow): void {
		const selected = this.selected.has(descriptor.id);
		const row = dom.append(list, $('label.chat-provider-setup-row'));
		row.classList.toggle('selected', selected);

		const checkbox = dom.append(row, $<HTMLInputElement>('input.chat-provider-setup-checkbox'));
		checkbox.type = 'checkbox';
		checkbox.checked = selected;
		// A switch role matches the toggle affordance and reads as on/off.
		checkbox.setAttribute('role', 'switch');
		checkbox.setAttribute('aria-label', localize('chat.providerSetup.select.aria', "Use {0}", descriptor.name));

		const toggle = dom.append(row, $('span.chat-provider-setup-toggle'));
		toggle.setAttribute('aria-hidden', 'true');
		dom.append(toggle, $('span.chat-provider-setup-toggle-knob'));

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
		description.id = `chat-provider-setup-description-${descriptor.id}`;
		description.textContent = descriptor.description;
		checkbox.setAttribute('aria-describedby', description.id);

		this._register(dom.addDisposableListener(checkbox, dom.EventType.CHANGE, () => {
			if (checkbox.checked) {
				this.selected.add(descriptor.id);
			} else {
				this.selected.delete(descriptor.id);
			}
			row.classList.toggle('selected', checkbox.checked);
			status(checkbox.checked
				? localize('chat.providerSetup.selected', "{0} selected.", descriptor.name)
				: localize('chat.providerSetup.deselected', "{0} deselected.", descriptor.name));
			this.updateContinueLabel();
		}));
	}

	private updateContinueLabel(): void {
		if (!this.continueButton) {
			return;
		}
		const any = this.selected.size > 0;
		this.continueButton.disabled = !any;
		this.continueButton.textContent = localize('chat.providerSetup.continue', "Continue");
	}

	/**
	 * Acts on everything switched on. Copilot owns the real sign-in; the others
	 * need a key, so they hand off to chat model management once Copilot is
	 * under way.
	 */
	private runContinue(): void {
		const rows = this.getRows().filter(row => this.selected.has(row.id));
		if (!rows.length) {
			return;
		}

		this.telemetryService.publicLog2<ChatProviderSetupEvent, ChatProviderSetupClassification>('chat.providerSetup.selected', { providers: rows.map(row => row.id).join(',') });

		if (this.selected.has('copilot')) {
			this.commandService.executeCommand(CHAT_SETUP_ACTION_ID);
		}

		// Anything beyond Copilot needs a key, which lives in chat model
		// management. Handing off there keeps this panel from duplicating it.
		if (rows.some(row => row.id !== 'copilot')) {
			this.commandService.executeCommand(MANAGE_CHAT_COMMAND_ID);
		}
	}
}
