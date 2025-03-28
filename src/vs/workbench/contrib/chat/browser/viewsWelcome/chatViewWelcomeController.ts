/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { chatViewsWelcomeRegistry, IChatViewsWelcomeDescriptor } from './chatViewsWelcome.js';

const $ = dom.$;

export interface IViewWelcomeDelegate {
	readonly onDidChangeViewWelcomeState: Event<void>;
	shouldShowWelcome(): boolean;
}

export class ChatViewWelcomeController extends Disposable {
	private element: HTMLElement | undefined;

	private enabled = false;
	private readonly enabledDisposables = this._register(new DisposableStore());
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IViewWelcomeDelegate,
		private readonly location: ChatAgentLocation,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();

		this.element = dom.append(this.container, dom.$('.chat-view-welcome'));
		this._register(Event.runAndSubscribe(
			delegate.onDidChangeViewWelcomeState,
			() => this.update()));
		this._register(chatViewsWelcomeRegistry.onDidChange(() => this.update(true)));
	}

	private update(force?: boolean): void {
		const enabled = this.delegate.shouldShowWelcome();
		if (this.enabled === enabled && !force) {
			return;
		}

		this.enabled = enabled;
		this.enabledDisposables.clear();

		if (!enabled) {
			this.container.classList.toggle('chat-view-welcome-visible', false);
			this.renderDisposables.clear();
			return;
		}

		const descriptors = chatViewsWelcomeRegistry.get();
		if (descriptors.length) {
			this.render(descriptors);

			const descriptorKeys: Set<string> = new Set(descriptors.flatMap(d => d.when.keys()));
			this.enabledDisposables.add(this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(descriptorKeys)) {
					this.render(descriptors);
				}
			}));
		}
	}

	private render(descriptors: ReadonlyArray<IChatViewsWelcomeDescriptor>): void {
		this.renderDisposables.clear();
		dom.clearNode(this.element!);

		const matchingDescriptors = descriptors.filter(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
		let enabledDescriptor: IChatViewsWelcomeDescriptor | undefined;
		for (const descriptor of matchingDescriptors) {
			if (typeof descriptor.content === 'function') {
				enabledDescriptor = descriptor; // when multiple descriptors match, prefer a "core" one over a "descriptive" one
				break;
			}
		}
		enabledDescriptor = enabledDescriptor ?? matchingDescriptors.at(0);
		if (enabledDescriptor) {
			const content: IChatViewWelcomeContent = {
				icon: enabledDescriptor.icon,
				title: enabledDescriptor.title,
				message: enabledDescriptor.content
			};
			const welcomeView = this.renderDisposables.add(this.instantiationService.createInstance(ChatViewWelcomePart, content, { firstLinkToButton: true, location: this.location }));
			this.element!.appendChild(welcomeView.element);
			this.container.classList.toggle('chat-view-welcome-visible', true);
		} else {
			this.container.classList.toggle('chat-view-welcome-visible', false);
		}
	}
}

export interface IChatViewWelcomeContent {
	icon?: ThemeIcon;
	title: string;
	message: IMarkdownString | ((disposables: DisposableStore) => HTMLElement);
	tips?: IMarkdownString;
}

export interface IChatViewWelcomeRenderOptions {
	firstLinkToButton?: boolean;
	location: ChatAgentLocation;
	isWidgetAgentWelcomeViewContent?: boolean;
}

export class ChatViewWelcomePart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		public readonly content: IChatViewWelcomeContent,
		options: IChatViewWelcomeRenderOptions | undefined,
		@IOpenerService private openerService: IOpenerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private logService: ILogService,
		@IChatAgentService chatAgentService: IChatAgentService,
	) {
		super();
		this.element = dom.$('.chat-welcome-view');

		try {
			const renderer = this.instantiationService.createInstance(MarkdownRenderer, {});

			// Icon
			const icon = dom.append(this.element, $('.chat-welcome-view-icon'));
			if (content.icon) {
				icon.appendChild(renderIcon(content.icon));
			}

			// Title
			const title = dom.append(this.element, $('.chat-welcome-view-title'));
			title.textContent = content.title;

			// Preview indicator
			if (typeof content.message !== 'function' && options?.isWidgetAgentWelcomeViewContent) {
				const container = dom.append(this.element, $('.chat-welcome-view-indicator-container'));
				dom.append(container, $('.chat-welcome-view-subtitle', undefined, localize('agentModeSubtitle', "Agent Mode")));
			}

			// Message
			const message = dom.append(this.element, $('.chat-welcome-view-message'));
			if (typeof content.message === 'function') {
				dom.append(message, content.message(this._register(new DisposableStore())));
			} else {
				const messageResult = this._register(renderer.render(content.message));
				const firstLink = options?.firstLinkToButton ? messageResult.element.querySelector('a') : undefined;
				if (firstLink) {
					const target = firstLink.getAttribute('data-href');
					const button = this._register(new Button(firstLink.parentElement!, defaultButtonStyles));
					button.label = firstLink.textContent ?? '';
					if (target) {
						this._register(button.onDidClick(() => {
							this.openerService.open(target, { allowCommands: true });
						}));
					}
					firstLink.replaceWith(button.element);
				}

				dom.append(message, messageResult.element);
			}

			// Tips
			if (content.tips) {
				const tips = dom.append(this.element, $('.chat-welcome-view-tips'));
				const tipsResult = this._register(renderer.render(content.tips));
				tips.appendChild(tipsResult.element);
			}
		} catch (err) {
			this.logService.error('Failed to render chat view welcome content', err);
		}
	}
}
