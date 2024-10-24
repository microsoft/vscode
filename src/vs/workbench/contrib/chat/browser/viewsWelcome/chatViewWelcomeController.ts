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
import { ChatAgentLocation } from '../../common/chatAgents.js';
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
		if (this.enabled === enabled || force) {
			return;
		}

		this.enabledDisposables.clear();
		if (!enabled) {
			this.container.classList.toggle('chat-view-welcome-visible', false);
			this.renderDisposables.clear();
			return;
		}

		this.enabled = true;
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

		const enabledDescriptor = descriptors.find(d => this.contextKeyService.contextMatchesRules(d.when));
		if (enabledDescriptor) {
			const content: IChatViewWelcomeContent = {
				icon: enabledDescriptor.icon,
				title: enabledDescriptor.title,
				message: enabledDescriptor.content,
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
	message: IMarkdownString;
	tips?: IMarkdownString;
}

export interface IChatViewWelcomeRenderOptions {
	firstLinkToButton?: boolean;
	location: ChatAgentLocation;
}

export class ChatViewWelcomePart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		content: IChatViewWelcomeContent,
		options: IChatViewWelcomeRenderOptions | undefined,
		@IOpenerService private openerService: IOpenerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private logService: ILogService,
	) {
		super();
		this.element = dom.$('.chat-welcome-view');

		try {
			const icon = dom.append(this.element!, $('.chat-welcome-view-icon'));
			const title = dom.append(this.element!, $('.chat-welcome-view-title'));

			if (options?.location === ChatAgentLocation.EditingSession) {
				const featureIndicator = dom.append(this.element!, $('.chat-welcome-view-indicator'));
				featureIndicator.textContent = localize('preview', 'PREVIEW');
			}
			const message = dom.append(this.element!, $('.chat-welcome-view-message'));

			if (content.icon) {
				icon.appendChild(renderIcon(content.icon));
			}

			title.textContent = content.title;
			const renderer = this.instantiationService.createInstance(MarkdownRenderer, {});
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

			if (content.tips) {
				const tips = dom.append(this.element!, $('.chat-welcome-view-tips'));
				const tipsResult = this._register(renderer.render(content.tips));
				tips.appendChild(tipsResult.element);
			}
		} catch (err) {
			this.logService.error('Failed to render chat view welcome content', err);
		}
	}
}
