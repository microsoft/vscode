/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewTitle.css';
import { h } from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService, IViewContainerModel } from '../../../common/views.js';
import { ActivityBarPosition, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { IChatModel } from '../common/chatModel.js';
import { ChatViewId } from './chat.js';
import { ChatConfiguration } from '../common/constants.js';

export interface IChatViewTitleDelegate {
	updateTitle(title: string): void;
}

export class ChatViewTitleControl extends Disposable {

	private static readonly DEFAULT_TITLE = localize('chat', "Chat Session");

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private get viewContainerModel(): IViewContainerModel | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(ChatViewId);
		if (viewContainer) {
			return this.viewDescriptorService.getViewContainerModel(viewContainer);
		}

		return undefined;
	}

	private title: string | undefined = undefined;

	private titleContainer: HTMLElement | undefined;
	private titleLabel: HTMLElement | undefined;

	private model: IChatModel | undefined;
	private modelDisposables = this._register(new MutableDisposable());

	private lastKnownHeight = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IChatViewTitleDelegate,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		this.render(this.container);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update when views change in container
		if (this.viewContainerModel) {
			this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors(() => this.doUpdate()));
			this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors(() => this.doUpdate()));
		}

		// Update on configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) ||
				e.affectsConfiguration(ChatConfiguration.ChatViewTitleEnabled)
			) {
				this.doUpdate();
			}
		}));
	}

	private render(parent: HTMLElement): void {
		const elements = h('div.chat-view-title-container', [
			h('span.chat-view-title-label@label')
		]);

		this.titleContainer = elements.root;
		this.titleLabel = elements.label;

		parent.appendChild(this.titleContainer);
	}

	update(model: IChatModel | undefined): void {
		this.model = model;

		this.modelDisposables.value = model?.onDidChange(e => {
			if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
				this.doUpdate();
			}
		});

		this.doUpdate();
	}

	private doUpdate(): void {
		this.title = this.model?.title;

		this.delegate.updateTitle(this.getTitleWithPrefix());

		this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
	}

	private updateTitle(title: string): void {
		if (!this.titleContainer || !this.titleLabel) {
			return;
		}

		if (!this.shouldRender()) {
			this.titleContainer.style.display = 'none';
		} else {
			this.titleLabel.textContent = title;
			this.titleContainer.style.display = 'flex';
		}

		const currentHeight = this.getHeight();
		if (currentHeight !== this.lastKnownHeight) {
			this.lastKnownHeight = currentHeight;

			this._onDidChangeHeight.fire();
		}
	}

	private shouldRender(): boolean {
		if (!this.isEnabled()) {
			return false; // title hidden via setting
		}

		if (this.viewContainerModel && this.viewContainerModel.visibleViewDescriptors.length > 1) {
			return false; // multiple views visible, chat view shows a title already
		}

		const location = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return location === ActivityBarPosition.DEFAULT; // in non-default locations a view title appears already
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewTitleEnabled) === true;
	}

	getSingleViewPaneContainerTitle(descriptorTitle: string | undefined): string | undefined {
		if (
			!this.isEnabled() ||	// title disabled
			this.shouldRender()		// title is rendered in the view, do not repeat
		) {
			return descriptorTitle;
		}

		return this.getTitleWithPrefix();
	}

	private getTitleWithPrefix(): string {
		if (this.title) {
			return localize('chatTitleWithPrefixCustom', "Chat: {0}", this.title);
		}

		return ChatViewTitleControl.DEFAULT_TITLE;
	}

	getHeight(): number {
		if (!this.titleContainer || this.titleContainer.style.display === 'none') {
			return 0;
		}

		return this.titleContainer.offsetHeight;
	}
}
