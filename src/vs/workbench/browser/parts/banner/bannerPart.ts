/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/bannerpart';
import { localize2 } from 'vs/nls';
import { $, addDisposableListener, append, asCSSUrl, clearNode, EventType, isHTMLElement } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { Part } from 'vs/workbench/browser/part';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Action } from 'vs/base/common/actions';
import { Link } from 'vs/platform/opener/browser/link';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Emitter } from 'vs/base/common/event';
import { IBannerItem, IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { widgetClose } from 'vs/platform/theme/common/iconRegistry';
import { BannerFocused } from 'vs/workbench/common/contextkeys';

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

	private _onDidChangeSize = this._register(new Emitter<{ width: number; height: number } | undefined>());
	override get onDidChange() { return this._onDidChangeSize.event; }

	//#endregion

	private item: IBannerItem | undefined;
	private readonly markdownRenderer: MarkdownRenderer;
	private visible = false;

	private actionBar: ActionBar | undefined;
	private messageActionsContainer: HTMLElement | undefined;
	private focusedActionIndex: number = -1;

	constructor(
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(Parts.BANNER_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.tabIndex = 0;

		// Restore focused action if needed
		this._register(addDisposableListener(this.element, EventType.FOCUS, () => {
			if (this.focusedActionIndex !== -1) {
				this.focusActionLink();
			}
		}));

		// Track focus
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
		BannerFocused.bindTo(scopedContextKeyService).set(true);

		return this.element;
	}

	private close(item: IBannerItem): void {
		// Hide banner
		this.setVisibility(false);

		// Remove from document
		clearNode(this.element);

		// Remember choice
		if (typeof item.onClose === 'function') {
			item.onClose();
		}

		this.item = undefined;
	}

	private focusActionLink(): void {
		const length = this.item?.actions?.length ?? 0;

		if (this.focusedActionIndex < length) {
			const actionLink = this.messageActionsContainer?.children[this.focusedActionIndex];
			if (isHTMLElement(actionLink)) {
				this.actionBar?.setFocusable(false);
				actionLink.focus();
			}
		} else {
			this.actionBar?.focus(0);
		}
	}

	private getAriaLabel(item: IBannerItem): string | undefined {
		if (item.ariaLabel) {
			return item.ariaLabel;
		}
		if (typeof item.message === 'string') {
			return item.message;
		}

		return undefined;
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
			this.focusedActionIndex = -1;

			this.layoutService.setPartHidden(!visible, Parts.BANNER_PART);
			this._onDidChangeSize.fire(undefined);
		}
	}

	focus(): void {
		this.focusedActionIndex = -1;
		this.element.focus();
	}

	focusNextAction(): void {
		const length = this.item?.actions?.length ?? 0;
		this.focusedActionIndex = this.focusedActionIndex < length ? this.focusedActionIndex + 1 : 0;

		this.focusActionLink();
	}

	focusPreviousAction(): void {
		const length = this.item?.actions?.length ?? 0;
		this.focusedActionIndex = this.focusedActionIndex > 0 ? this.focusedActionIndex - 1 : length;

		this.focusActionLink();
	}

	hide(id: string): void {
		if (this.item?.id !== id) {
			return;
		}

		this.setVisibility(false);
	}

	show(item: IBannerItem): void {
		if (item.id === this.item?.id) {
			this.setVisibility(true);
			return;
		}

		// Clear previous item
		clearNode(this.element);

		// Banner aria label
		const ariaLabel = this.getAriaLabel(item);
		if (ariaLabel) {
			this.element.setAttribute('aria-label', ariaLabel);
		}

		// Icon
		const iconContainer = append(this.element, $('div.icon-container'));
		iconContainer.setAttribute('aria-hidden', 'true');

		if (ThemeIcon.isThemeIcon(item.icon)) {
			iconContainer.appendChild($(`div${ThemeIcon.asCSSSelector(item.icon)}`));
		} else {
			iconContainer.classList.add('custom-icon');

			if (URI.isUri(item.icon)) {
				iconContainer.style.backgroundImage = asCSSUrl(item.icon);
			}
		}

		// Message
		const messageContainer = append(this.element, $('div.message-container'));
		messageContainer.setAttribute('aria-hidden', 'true');
		messageContainer.appendChild(this.getBannerMessage(item.message));

		// Message Actions
		this.messageActionsContainer = append(this.element, $('div.message-actions-container'));
		if (item.actions) {
			for (const action of item.actions) {
				this._register(this.instantiationService.createInstance(Link, this.messageActionsContainer, { ...action, tabIndex: -1 }, {}));
			}
		}

		// Action
		const actionBarContainer = append(this.element, $('div.action-container'));
		this.actionBar = this._register(new ActionBar(actionBarContainer));
		const label = item.closeLabel ?? 'Close Banner';
		const closeAction = this._register(new Action('banner.close', label, ThemeIcon.asClassName(widgetClose), true, () => this.close(item)));
		this.actionBar.push(closeAction, { icon: true, label: false });
		this.actionBar.setFocusable(false);

		this.setVisibility(true);
		this.item = item;
	}

	toJSON(): object {
		return {
			type: Parts.BANNER_PART
		};
	}
}

registerSingleton(IBannerService, BannerPart, InstantiationType.Eager);


// Keybindings

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusBanner',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Escape,
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focus();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusNextAction',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.RightArrow,
	secondary: [KeyCode.DownArrow],
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focusNextAction();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusPreviousAction',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.LeftArrow,
	secondary: [KeyCode.UpArrow],
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focusPreviousAction();
	}
});


// Actions

class FocusBannerAction extends Action2 {

	static readonly ID = 'workbench.action.focusBanner';
	static readonly LABEL = localize2('focusBanner', "Focus Banner");

	constructor() {
		super({
			id: FocusBannerAction.ID,
			title: FocusBannerAction.LABEL,
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.focusPart(Parts.BANNER_PART);
	}
}

registerAction2(FocusBannerAction);
