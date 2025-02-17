/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './bannerController.css';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILinkDescriptor, Link } from '../../../../platform/opener/browser/link.js';
import { widgetClose } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const BANNER_ELEMENT_HEIGHT = 26;

export class BannerController extends Disposable {
	private readonly banner: Banner;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.banner = this._register(this.instantiationService.createInstance(Banner));
	}

	public hide() {
		this._editor.setBanner(null, 0);
		this.banner.clear();
	}

	public show(item: IBannerItem) {
		this.banner.show({
			...item,
			onClose: () => {
				this.hide();
				item.onClose?.();
			}
		});
		this._editor.setBanner(this.banner.element, BANNER_ELEMENT_HEIGHT);
	}
}

// TODO@hediet: Investigate if this can be reused by the workspace banner (bannerPart.ts).
class Banner extends Disposable {
	public element: HTMLElement;

	private readonly markdownRenderer: MarkdownRenderer;

	private messageActionsContainer: HTMLElement | undefined;

	private actionBar: ActionBar | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

		this.element = $('div.editor-banner');
		this.element.tabIndex = 0;
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

	public clear() {
		clearNode(this.element);
	}

	public show(item: IBannerItem) {
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

		if (item.icon) {
			iconContainer.appendChild($(`div${ThemeIcon.asCSSSelector(item.icon)}`));
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
		this.actionBar.push(this._register(
			new Action(
				'banner.close',
				'Close Banner',
				ThemeIcon.asClassName(widgetClose),
				true,
				() => {
					if (typeof item.onClose === 'function') {
						item.onClose();
					}
				}
			)
		), { icon: true, label: false });
		this.actionBar.setFocusable(false);
	}
}

export interface IBannerItem {
	readonly id: string;
	readonly icon: ThemeIcon | undefined;
	readonly message: string | MarkdownString;
	readonly actions?: ILinkDescriptor[];
	readonly ariaLabel?: string;
	readonly onClose?: () => void;
}
