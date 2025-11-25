/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chatViewTitle.css';

import { h, append } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService, IViewContainerModel } from '../../../common/views.js';
import { ActivityBarPosition, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { IChatModel } from '../common/chatModel.js';

export interface IChatViewTitleDelegate {
	getCurrentModel(): IChatModel | undefined;
	updatePrimaryTitle(title: string): void;
	requestLayout(): void;
}

export class ChatViewTitleController extends Disposable {
	private readonly viewContainerModel: IViewContainerModel | undefined;
	private hasMultipleVisibleViews = false;
	private currentPrimaryTitle: string;
	private _secondaryTitleContainer: HTMLElement | undefined;
	private _secondaryTitle: HTMLElement | undefined;

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
			this.hasMultipleVisibleViews = this.viewContainerModel.visibleViewDescriptors.length > 1;
			this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors(() => this.handleVisibleViewDescriptorsChanged()));
			this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors(() => this.handleVisibleViewDescriptorsChanged()));
		}
		this.currentPrimaryTitle = localize('chat', "Chat");
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.handleActivityBarLocationChange();
			}
			if (e.affectsConfiguration('workbench.secondarySideBar.showLabels')) {
				this.handleSecondarySideBarShowLabelsChange();
			}
		}));
	}

	render(parent: HTMLElement): void {
		if (this._secondaryTitleContainer) {
			return;
		}

		const elements = h('div.chat-view-secondary-title-container', [
			h('span.chat-view-secondary-title-text@text')
		]);
		this._secondaryTitleContainer = elements.root;
		this._secondaryTitle = elements.text;
		append(parent, this._secondaryTitleContainer);
	}

	update(model?: IChatModel): void {
		model = model ?? this.delegate.getCurrentModel();
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

	getSingleViewPaneContainerTitle(superTitle: string | undefined): string | undefined {
		if (!this.shouldRenderSecondaryTitleBar()) {
			return this.currentPrimaryTitle;
		}
		return superTitle ?? this.currentPrimaryTitle;
	}

	getSecondaryTitleHeight(): number {
		if (!this._secondaryTitleContainer || this._secondaryTitleContainer.style.display === 'none') {
			return 0;
		}
		return this._secondaryTitleContainer.offsetHeight;
	}

	private handleActivityBarLocationChange(): void {
		this.updateViewTitleBasedOnShowLabelsConfig();
		this.updateSecondaryTitleVisibility();
	}

	private handleSecondarySideBarShowLabelsChange(): void {
		this.updateViewTitleBasedOnShowLabelsConfig();
	}

	private handleVisibleViewDescriptorsChanged(): void {
		if (!this.viewContainerModel) {
			return;
		}
		const hasMultiple = this.viewContainerModel.visibleViewDescriptors.length > 1;
		if (hasMultiple === this.hasMultipleVisibleViews) {
			return;
		}
		this.hasMultipleVisibleViews = hasMultiple;
		this.updateSecondaryTitleVisibility();
	}

	private updateSecondaryTitleVisibility(): void {
		if (!this.shouldRenderSecondaryTitleBar()) {
			this.setSecondaryTitle(undefined);
			return;
		}
		this.update();
	}

	private updateViewTitleBasedOnShowLabelsConfig(): void {
		this.update();
	}

	private shouldRenderSecondaryTitleBar(): boolean {
		if (this.hasMultipleVisibleViews) {
			return false;
		}
		const location = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return location !== ActivityBarPosition.TOP && location !== ActivityBarPosition.BOTTOM && location !== ActivityBarPosition.HIDDEN;
	}

	private computeSecondarySideBarLabelConfig(): boolean {
		if (this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT) {
			return false;
		}
		return this.configurationService.getValue('workbench.secondarySideBar.showLabels') !== false;
	}

	private setSecondaryTitle(title: string | undefined): void {
		if (!this._secondaryTitleContainer || !this._secondaryTitle) {
			return;
		}
		if (!this.shouldRenderSecondaryTitleBar() || !title) {
			this._secondaryTitleContainer.style.display = 'none';
		} else {
			this._secondaryTitle.textContent = title;
			this._secondaryTitleContainer.style.display = 'flex';
		}
		this.delegate.requestLayout();
	}

	private shouldOmitChatPrefix(): boolean {
		return this.shouldRenderSecondaryTitleBar() && this.computeSecondarySideBarLabelConfig();
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
