/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/bannerpart';
import { $, append, clearNode } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageTarget } from 'vs/platform/storage/common/storage';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Action } from 'vs/base/common/actions';
import { Link } from 'vs/platform/opener/browser/link';
import { attachLinkStyler } from 'vs/platform/theme/common/styler';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Emitter } from 'vs/base/common/event';
import { IBannerItem, IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { BANNER_BACKGROUND, BANNER_FOREGROUND, BANNER_ICON_FOREGROUND } from 'vs/workbench/common/theme';


// Icons

const bannerCloseIcon = registerCodicon('banner-close', Codicon.close);


// Theme support

registerThemingParticipant((theme, collector) => {
	const backgroundColor = theme.getColor(BANNER_BACKGROUND);
	const foregroundColor = theme.getColor(BANNER_FOREGROUND);
	const iconForegroundColor = theme.getColor(BANNER_ICON_FOREGROUND);

	if (backgroundColor) {
		collector.addRule(`.monaco-workbench .part.banner { background-color: ${backgroundColor}; }`);
	}

	if (foregroundColor) {
		collector.addRule(`.monaco-workbench .part.banner { color: ${foregroundColor}; }`);
		collector.addRule(`.monaco-workbench .part.banner .action-container .codicon { color: ${foregroundColor}; }`);
	}

	if (iconForegroundColor) {
		collector.addRule(`.monaco-workbench .part.banner .icon-container .codicon { color: ${iconForegroundColor} }`);
	}
});


// Banner Part

export class BannerPart extends Part implements IBannerService {
	declare readonly _serviceBrand: undefined;

	// #region IView

	readonly height: number = 26;
	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		return this.visible ? this.height : 0;
	}

	get maximumHeight(): number {
		return this.visible ? this.height : 0;
	}

	private _onDidChangeSize = new Emitter<{ width: number; height: number; } | undefined>();

	override get onDidChange() { return this._onDidChangeSize.event; }

	//#endregion

	private item: IBannerItem | undefined;
	private readonly markdownRenderer: MarkdownRenderer;
	private visible = false;

	constructor(
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(Parts.BANNER_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		return this.element;
	}

	private close(item: IBannerItem): void {
		// Hide banner
		this.setVisibility(false);

		// Remove from document
		clearNode(this.element);

		// Remember choice
		if (item.scope) {
			this.storageService.store(item.id, true, item.scope, StorageTarget.USER);
		}

		this.item = undefined;
	}

	private getBannerMessage(message: MarkdownString | string): HTMLElement {
		if (typeof message === 'string') {
			const element = $('span');
			element.innerText = message;
			return element;
		}

		return this.markdownRenderer.render(message).element;
	}

	private setVisibility(visible: boolean): void {
		if (visible !== this.visible) {
			this.visible = visible;

			this._onDidChangeSize.fire(undefined);
		}
	}

	hide(id: string): void {
		if (this.item?.id !== id) {
			return;
		}

		this.setVisibility(false);
	}

	show(item: IBannerItem): void {
		if (item.scope && this.storageService.getBoolean(item.id, item.scope, false)) {
			return;
		}

		if (item.id === this.item?.id) {
			this.setVisibility(true);
			return;
		}

		// Clear previous item
		clearNode(this.element);

		// Icon
		const iconContainer = append(this.element, $('div.icon-container'));
		iconContainer.appendChild($(`div${item.icon.cssSelector}`));

		// Message
		const messageContainer = append(this.element, $('div.message-container'));
		messageContainer.appendChild(this.getBannerMessage(item.message));

		// Message Actions
		if (item.actions) {
			const actionContainer = append(this.element, $('div.message-actions-container'));

			for (const action of item.actions) {
				const actionLink = this._register(this.instantiationService.createInstance(Link, action, {}));
				this._register(attachLinkStyler(actionLink, this.themeService, { textLinkForeground: BANNER_FOREGROUND }));
				actionContainer.appendChild(actionLink.el);
			}
		}

		// Action
		const actionBarContainer = append(this.element, $('div.action-container'));
		const actionBar = this._register(new ActionBar(actionBarContainer));
		const closeAction = this._register(new Action('banner.close', 'Close Banner', bannerCloseIcon.classNames, true, () => this.close(item)));
		actionBar.push(closeAction, { icon: true, label: false });

		this.setVisibility(true);
		this.item = item;
	}

	toJSON(): object {
		return {
			type: Parts.BANNER_PART
		};
	}
}

registerSingleton(IBannerService, BannerPart);
