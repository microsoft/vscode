/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/bannerpart';
import { localize } from 'vs/nls';
import { $, append } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Action } from 'vs/base/common/actions';
import { Link } from 'vs/platform/opener/browser/link';
import { attachLinkStyler } from 'vs/platform/theme/common/styler';
import { editorInfoForeground, listActiveSelectionBackground, listActiveSelectionForeground, registerColor, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';
import { CloseBannerAction } from 'vs/workbench/browser/parts/banner/bannerActions';


// Icons

const shieldIcon = registerCodicon('banner-trust-icon', Codicon.shield);
const bannerCloseIcon = registerCodicon('banner-close', Codicon.close);


// Theme colors

const BANNER_BACKGROUND = registerColor('banner.background', {
	dark: listActiveSelectionBackground,
	light: listActiveSelectionBackground,
	hc: listActiveSelectionBackground
}, localize('banner.background', ""));

const BANNER_FOREGROUND = registerColor('banner.foreground', {
	dark: listActiveSelectionForeground,
	light: listActiveSelectionForeground,
	hc: listActiveSelectionForeground
}, localize('banner.foreground', ""));

const BANNER_ICON_FOREGROUND = registerColor('banner.iconForeground', {
	dark: editorInfoForeground,
	light: editorInfoForeground,
	hc: editorInfoForeground

}, localize('banner.iconForeground', ""));

const BANNER_TEXT_LINK_FOREGROUND = registerColor('banner.textLinkForeground', {
	dark: textLinkForeground,
	light: Color.white,
	hc: Color.white
}, localize('banner.textLinkForeground', ""));

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

export const IBannerService = createDecorator<IBannerService>('bannerService');

export interface IBannerService {
	readonly _serviceBrand: undefined;
}

export class BannerPart extends Part implements IBannerService {
	declare readonly _serviceBrand: undefined;

	// #region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 26;
	readonly maximumHeight: number = 26;

	//#endregion

	constructor(
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(Parts.BANNER_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.tabIndex = 0;

		// Icon
		const iconContainer = append(this.element, $('div.icon-container'));
		iconContainer.appendChild($(`div${shieldIcon.cssSelector}`));

		// Message
		const messageContainer = append(this.element, $('div.message-container'));
		messageContainer.innerText = localize('restrictedModeMessage', "Restricted Mode has limited functionality. Trust this folder to enable advanced features.");

		// Message Actions
		const messageActionsContainer = append(this.element, $('div.message-actions-container'));
		const manageLink = this._register(this.instantiationService.createInstance(Link, { label: 'Manage', href: 'command:workbench.trust.manage' }));
		this._register(attachLinkStyler(manageLink, this.themeService, { textLinkForeground: BANNER_TEXT_LINK_FOREGROUND }));
		messageActionsContainer.appendChild(manageLink.el);

		const learnMoreLink = this._register(this.instantiationService.createInstance(Link, { label: 'Learn More', href: 'https://aka.ms/vscode-workspace-trust' }));
		this._register(attachLinkStyler(learnMoreLink, this.themeService, { textLinkForeground: BANNER_TEXT_LINK_FOREGROUND }));
		messageActionsContainer.appendChild(learnMoreLink.el);

		// Action
		const actionBarContainer = append(this.element, $('div.action-container'));
		const actionBar = this._register(new ActionBar(actionBarContainer));
		const closeAction = this._register(new Action('banner.close', 'Close Banner', bannerCloseIcon.classNames, true, () => {
			this.instantiationService.invokeFunction(accessor => new CloseBannerAction().run(accessor));
		}));
		actionBar.push(closeAction, { icon: true, label: false });

		return this.element;
	}

	toJSON(): object {
		return {
			type: Parts.BANNER_PART
		};
	}
}

registerSingleton(IBannerService, BannerPart);
