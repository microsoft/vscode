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

export interface IChatViewTitleDelegate {
	updatePrimaryTitle(title: string): void;
}

export class ChatViewTitleControl extends Disposable {

	private static readonly DEFAULT_TITLE = localize('chat', "Chat");

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private get viewContainerModel(): IViewContainerModel | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(ChatViewId);
		if (viewContainer) {
			return this.viewDescriptorService.getViewContainerModel(viewContainer);
		}

		return undefined;
	}

	private primaryTitle = ChatViewTitleControl.DEFAULT_TITLE;

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
				e.affectsConfiguration('workbench.secondarySideBar.showLabels')
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
		const customTitle = this.model?.hasCustomTitle ? this.model?.title : undefined;
		const prefixedCustomTitle = customTitle ? this.withChatPrefix(customTitle) : undefined;
		const primaryTitle = prefixedCustomTitle ?? ChatViewTitleControl.DEFAULT_TITLE;
		this.primaryTitle = primaryTitle;

		this.delegate.updatePrimaryTitle(primaryTitle);

		if (!this.shouldRenderSecondaryTitleBar()) {
			this.setSecondaryTitle(undefined);
			return;
		}

		if (customTitle) {
			const secondaryTitle = this.shouldOmitChatPrefix() ? customTitle : this.withChatPrefix(customTitle);
			this.setSecondaryTitle(secondaryTitle);
		} else {
			this.setSecondaryTitle(undefined);
		}
	}

	private withChatPrefix(title: string | undefined): string | undefined {
		if (!title) {
			return undefined;
		}

		const localizedPrefix = localize('chatViewTitle.prefixLabel', "Chat: ");
		if (title.startsWith(localizedPrefix) || title.startsWith('Chat: ')) {
			return title;
		}

		return localize('chatViewTitle.prefixedTitle', "Chat: {0}", title);
	}

	getSingleViewPaneContainerTitle(descriptorTitle: string | undefined): string | undefined {
		if (!this.shouldRenderSecondaryTitleBar()) {
			return this.primaryTitle;
		}

		return descriptorTitle ?? this.primaryTitle;
	}

	private shouldRenderSecondaryTitleBar(): boolean {
		if (this.viewContainerModel && this.viewContainerModel.visibleViewDescriptors.length > 1) {
			return false;
		}

		const location = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return location !== ActivityBarPosition.TOP && location !== ActivityBarPosition.BOTTOM && location !== ActivityBarPosition.HIDDEN;
	}

	private setSecondaryTitle(title: string | undefined): void {
		if (!this.titleContainer || !this.titleLabel) {
			return;
		}

		if (!this.shouldRenderSecondaryTitleBar() || !title) {
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

	private shouldOmitChatPrefix(): boolean {
		if (!this.shouldRenderSecondaryTitleBar()) {
			return false;
		}

		if (this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT) {
			return false;
		}

		return this.configurationService.getValue('workbench.secondarySideBar.showLabels') !== false;
	}

	getHeight(): number {
		if (!this.titleContainer || this.titleContainer.style.display === 'none') {
			return 0;
		}

		return this.titleContainer.offsetHeight;
	}
}
