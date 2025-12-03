/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewTitle.css';
import { h, append } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService, IViewContainerModel } from '../../../common/views.js';
import { ActivityBarPosition, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { IChatModel } from '../common/chatModel.js';

export interface IChatViewTitleDelegate {
	updatePrimaryTitle(title: string): void;
}

export class ChatViewTitleControl extends Disposable {

	private readonly viewContainerModel: IViewContainerModel | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private currentPrimaryTitle: string;
	private currentModel: IChatModel | undefined;
	private secondaryTitleContainer: HTMLElement | undefined;
	private secondaryTitle: HTMLElement | undefined;

	private modelDisposables = this._register(new MutableDisposable());

	private lastKnownHeight = 0;

	constructor(
		private readonly viewId: string,
		private readonly delegate: IChatViewTitleDelegate,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(this.viewId);
		if (viewContainer) {
			this.viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);

			this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors(() => this.applyUpdate()));
			this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors(() => this.applyUpdate()));
		}

		this.currentPrimaryTitle = localize('chat', "Chat");

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) ||
				e.affectsConfiguration('workbench.secondarySideBar.showLabels')) {
				this.applyUpdate();
			}
		}));
	}

	render(parent: HTMLElement): void {
		if (this.secondaryTitleContainer) {
			return;
		}

		const elements = h('div.chat-view-secondary-title-container', [
			h('span.chat-view-secondary-title-text@text')
		]);

		this.secondaryTitleContainer = elements.root;
		this.secondaryTitle = elements.text;
		append(parent, this.secondaryTitleContainer);
	}

	update(model: IChatModel | undefined): void {
		this.currentModel = model;

		this.modelDisposables.value = model?.onDidChange(e => {
			if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
				this.applyUpdate();
			}
		});

		this.applyUpdate();
	}

	private applyUpdate(): void {
		const model = this.currentModel;
		const hasCustomTitle = !!(model && model.hasCustomTitle);
		const customTitle = hasCustomTitle ? model!.title : undefined;
		const prefixedCustomTitle = customTitle ? this.withChatPrefix(customTitle) : undefined;
		const chatTitle = localize('chat', "Chat");
		const primaryTitle = prefixedCustomTitle ?? chatTitle;
		this.currentPrimaryTitle = primaryTitle;

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

	getSingleViewPaneContainerTitle(descriptorTitle: string | undefined): string | undefined {
		if (!this.shouldRenderSecondaryTitleBar()) {
			return this.currentPrimaryTitle;
		}

		return descriptorTitle ?? this.currentPrimaryTitle;
	}

	getHeight(): number {
		if (!this.secondaryTitleContainer || this.secondaryTitleContainer.style.display === 'none') {
			return 0;
		}

		return this.secondaryTitleContainer.offsetHeight;
	}

	private shouldRenderSecondaryTitleBar(): boolean {
		if (this.viewContainerModel && this.viewContainerModel.visibleViewDescriptors.length > 1) {
			return false;
		}

		const location = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return location !== ActivityBarPosition.TOP && location !== ActivityBarPosition.BOTTOM && location !== ActivityBarPosition.HIDDEN;
	}

	private setSecondaryTitle(title: string | undefined): void {
		if (!this.secondaryTitleContainer || !this.secondaryTitle) {
			return;
		}

		if (!this.shouldRenderSecondaryTitleBar() || !title) {
			this.secondaryTitleContainer.style.display = 'none';
		} else {
			this.secondaryTitle.textContent = title;
			this.secondaryTitleContainer.style.display = 'flex';
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
}
