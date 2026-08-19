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
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';

const $ = dom.$;

type ChatProviderSetupClassification = {
	owner: 'eli-w-king';
	comment: 'Tracks which way of getting models a signed-out user picks from the chat panel.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Id of the provider the user chose to set up.' };
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
	readonly action: string;
	readonly commandId: string;
}

/**
 * The signed-out chat surface. With no model configured there is exactly one
 * thing worth doing, so this leads with signing in rather than asking the user
 * to compose a selection first.
 *
 * Copilot sits alone at the top as the primary action. The other routes are
 * real but rarer, so they wait behind a disclosure instead of competing for
 * attention with the thing most people want.
 */
export class ChatProviderSetupPart extends Disposable {

	readonly element: HTMLElement;

	private primaryAvatar: HTMLElement | undefined;
	private primaryDescription: HTMLElement | undefined;
	private primaryButton: HTMLButtonElement | undefined;
	private otherRegion: HTMLElement | undefined;
	private otherToggle: HTMLButtonElement | undefined;
	private otherExpanded = false;
	private disposed = false;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// While this list is up it is the sign-in affordance, so other prompts
		// for the same thing (the title-bar indicator) stand down.
		const visible = ChatEntitlementContextKeys.Setup.providerListVisible.bindTo(contextKeyService);
		visible.set(true);
		this._register(toDisposable(() => visible.reset()));
		this._register(toDisposable(() => { this.disposed = true; }));

		this.element = $('.chat-provider-setup');
		this.render();
		this.resolveExistingAccount();
	}

	private render(): void {
		const intro = dom.append(this.element, $('.chat-provider-setup-intro'));
		const title = dom.append(intro, $('h2.chat-provider-setup-title'));
		title.textContent = localize('chat.providerSetup.title', "Let's get you set up");
		const subtitle = dom.append(intro, $('p.chat-provider-setup-subtitle'));
		subtitle.textContent = localize('chat.providerSetup.subtitle', "Sign in to start chatting. You can add more models later.");

		this.renderPrimary();
		this.renderOther();

		status(localize('chat.providerSetup.aria.status', "Sign in to GitHub Copilot to start chatting, or open other ways to get models."));
	}

	/** Copilot: the one thing most people should do, given its own card. */
	private renderPrimary(): void {
		const descriptor = this.getPrimaryRow();
		const card = dom.append(this.element, $('.chat-provider-setup-primary'));

		const mark = this.primaryAvatar = dom.append(card, $('span.chat-provider-setup-mark'));
		mark.appendChild(renderIcon(descriptor.icon!));
		mark.setAttribute('aria-hidden', 'true');

		const copy = dom.append(card, $('.chat-provider-setup-copy'));
		const name = dom.append(copy, $('span.chat-provider-setup-name'));
		name.textContent = descriptor.name;
		const description = this.primaryDescription = dom.append(copy, $('span.chat-provider-setup-description'));
		description.textContent = descriptor.description;

		const button = this.primaryButton = dom.append(card, $<HTMLButtonElement>('button.chat-provider-setup-action.primary'));
		button.type = 'button';
		button.textContent = descriptor.action;
		this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => this.run(descriptor)));
	}

	/**
	 * A standard disclosure: the toggle owns the expanded state and points at
	 * the region it controls, so the whole thing is one stop for a keyboard.
	 */
	private renderOther(): void {
		const wrapper = dom.append(this.element, $('.chat-provider-setup-other'));

		const toggle = this.otherToggle = dom.append(wrapper, $<HTMLButtonElement>('button.chat-provider-setup-other-toggle'));
		toggle.type = 'button';
		toggle.id = 'chat-provider-setup-other-toggle';
		toggle.setAttribute('aria-expanded', 'false');
		toggle.setAttribute('aria-controls', 'chat-provider-setup-other-region');

		const chevron = dom.append(toggle, $('span.chat-provider-setup-chevron'));
		chevron.appendChild(renderIcon(Codicon.chevronRight));
		chevron.setAttribute('aria-hidden', 'true');

		const label = dom.append(toggle, $('span'));
		label.textContent = localize('chat.providerSetup.other', "Other ways to get models");

		const region = this.otherRegion = dom.append(wrapper, $('.chat-provider-setup-other-region'));
		region.id = 'chat-provider-setup-other-region';
		region.setAttribute('role', 'group');
		region.setAttribute('aria-labelledby', toggle.id);
		region.hidden = true;

		for (const descriptor of this.getOtherRows()) {
			this.renderRow(region, descriptor);
		}

		this._register(dom.addDisposableListener(toggle, dom.EventType.CLICK, () => this.toggleOther()));
	}

	private toggleOther(): void {
		if (!this.otherRegion || !this.otherToggle) {
			return;
		}
		this.otherExpanded = !this.otherExpanded;
		this.otherRegion.hidden = !this.otherExpanded;
		this.otherToggle.setAttribute('aria-expanded', String(this.otherExpanded));
		this.otherToggle.classList.toggle('expanded', this.otherExpanded);
		status(this.otherExpanded
			? localize('chat.providerSetup.other.expanded', "Other ways to get models expanded.")
			: localize('chat.providerSetup.other.collapsed', "Other ways to get models collapsed."));
	}

	private renderRow(parent: HTMLElement, descriptor: IChatProviderRow): void {
		const row = dom.append(parent, $('.chat-provider-setup-row'));

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

		const button = dom.append(row, $<HTMLButtonElement>('button.chat-provider-setup-action'));
		button.type = 'button';
		button.textContent = descriptor.action;
		// The visible label repeats across rows, so name the control by the
		// provider it belongs to rather than leaving three identical buttons.
		button.setAttribute('aria-label', localize('chat.providerSetup.action.aria', "{0}: {1}", descriptor.name, descriptor.action));
		button.setAttribute('aria-describedby', description.id);
		this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => this.run(descriptor)));
	}

	private getPrimaryRow(): IChatProviderRow {
		return {
			id: 'copilot',
			icon: Codicon.github,
			name: localize('chat.providerSetup.copilot.name', "GitHub Copilot"),
			description: localize('chat.providerSetup.copilot.description', "Free with your GitHub account."),
			action: localize('chat.providerSetup.copilot.action', "Sign In"),
			commandId: CHAT_SETUP_ACTION_ID,
		};
	}

	private getOtherRows(): readonly IChatProviderRow[] {
		return [
			{
				id: 'chatgpt',
				markClass: 'openai',
				name: localize('chat.providerSetup.chatgpt.name', "ChatGPT"),
				description: localize('chat.providerSetup.chatgpt.description', "Your OpenAI account or key."),
				action: localize('chat.providerSetup.chatgpt.action', "Connect"),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
			{
				id: 'byok',
				icon: Codicon.key,
				name: localize('chat.providerSetup.byok.name', "Your own key"),
				description: localize('chat.providerSetup.byok.description', "Anthropic, Azure, OpenRouter."),
				action: localize('chat.providerSetup.byok.action', "Set Up"),
				commandId: MANAGE_CHAT_COMMAND_ID,
			},
		];
	}

	/**
	 * A user can already have a GitHub account here without Copilot being set
	 * up. Showing who they are turns a cold "Sign In" into carrying on as
	 * themselves, and saves them wondering which account they are about to use.
	 */
	private async resolveExistingAccount(): Promise<void> {
		const providerId = this.productService.defaultChatAgent?.provider.default.id;
		if (!providerId) {
			return;
		}

		let accounts;
		try {
			accounts = await this.authenticationService.getAccounts(providerId);
		} catch {
			return; // No provider registered yet; the signed-out copy is correct.
		}

		const account = accounts?.[0];
		if (this.disposed || !account || !this.primaryAvatar || !this.primaryDescription || !this.primaryButton) {
			return;
		}

		dom.clearNode(this.primaryAvatar);
		this.primaryAvatar.classList.add('account');
		// A monogram keeps this offline and avoids reaching out to a provider
		// for an image before the user has agreed to connect to it.
		this.primaryAvatar.textContent = account.label.charAt(0).toUpperCase();

		this.primaryDescription.textContent = localize('chat.providerSetup.copilot.signedIn', "Signed in as {0}.", account.label);
		this.primaryButton.textContent = localize('chat.providerSetup.copilot.continueAs', "Continue");
	}

	private run(descriptor: IChatProviderRow): void {
		this.telemetryService.publicLog2<ChatProviderSetupEvent, ChatProviderSetupClassification>('chat.providerSetup.selected', { provider: descriptor.id });
		this.commandService.executeCommand(descriptor.commandId);
	}
}
