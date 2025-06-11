/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { verifiedPublisherIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { installCountIcon, starEmptyIcon, starFullIcon, starHalfIcon } from '../../extensions/browser/extensionsIcons.js';
import { IMcpServerContainer, IWorkbenchMcpServer, mcpServerIcon } from '../common/mcpTypes.js';

export abstract class McpServerWidget extends Disposable implements IMcpServerContainer {
	private _mcpServer: IWorkbenchMcpServer | null = null;
	get mcpServer(): IWorkbenchMcpServer | null { return this._mcpServer; }
	set mcpServer(mcpServer: IWorkbenchMcpServer | null) { this._mcpServer = mcpServer; this.update(); }
	update(): void { this.render(); }
	abstract render(): void;
}

export function onClick(element: HTMLElement, callback: () => void): IDisposable {
	const disposables: DisposableStore = new DisposableStore();
	disposables.add(dom.addDisposableListener(element, dom.EventType.CLICK, dom.finalHandler(callback)));
	disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_UP, e => {
		const keyboardEvent = new StandardKeyboardEvent(e);
		if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
			e.preventDefault();
			e.stopPropagation();
			callback();
		}
	}));
	return disposables;
}

export class McpServerIconWidget extends McpServerWidget {

	private readonly disposables = this._register(new DisposableStore());
	private readonly element: HTMLElement;
	private readonly iconElement: HTMLImageElement;
	private readonly defaultIconElement: HTMLElement;

	private iconUrl: string | undefined;

	constructor(
		container: HTMLElement,
	) {
		super();
		this.element = dom.append(container, dom.$('.extension-icon'));

		this.iconElement = dom.append(this.element, dom.$('img.icon', { alt: '' }));
		this.iconElement.style.display = 'none';

		this.defaultIconElement = dom.append(this.element, dom.$(ThemeIcon.asCSSSelector(mcpServerIcon)));
		this.defaultIconElement.style.display = 'none';

		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.iconUrl = undefined;
		this.iconElement.src = '';
		this.iconElement.style.display = 'none';
		this.defaultIconElement.style.display = 'none';
		this.disposables.clear();
	}

	render(): void {
		if (!this.mcpServer) {
			this.clear();
			return;
		}

		if (this.mcpServer.iconUrl) {
			this.iconElement.style.display = 'inherit';
			this.defaultIconElement.style.display = 'none';
			if (this.iconUrl !== this.mcpServer.iconUrl) {
				this.iconUrl = this.mcpServer.iconUrl;
				this.disposables.add(dom.addDisposableListener(this.iconElement, 'error', () => {
					this.iconElement.style.display = 'none';
					this.defaultIconElement.style.display = 'inherit';
				}, { once: true }));
				this.iconElement.src = this.iconUrl;
				if (!this.iconElement.complete) {
					this.iconElement.style.visibility = 'hidden';
					this.iconElement.onload = () => this.iconElement.style.visibility = 'inherit';
				} else {
					this.iconElement.style.visibility = 'inherit';
				}
			}
		} else {
			this.iconUrl = undefined;
			this.iconElement.style.display = 'none';
			this.iconElement.src = '';
			this.defaultIconElement.style.display = 'inherit';
		}
	}
}

export class PublisherWidget extends McpServerWidget {

	private element: HTMLElement | undefined;
	private containerHover: IManagedHover | undefined;

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.element?.remove();
		this.disposables.clear();
	}

	render(): void {
		this.clear();
		if (!this.mcpServer?.publisherDisplayName) {
			return;
		}

		this.element = dom.append(this.container, dom.$('.publisher'));
		const publisherDisplayName = dom.$('.publisher-name.ellipsis');
		publisherDisplayName.textContent = this.mcpServer.publisherDisplayName;

		const verifiedPublisher = dom.$('.verified-publisher');
		dom.append(verifiedPublisher, dom.$('span.extension-verified-publisher.clickable'), renderIcon(verifiedPublisherIcon));

		if (this.small) {
			if (this.mcpServer.gallery?.publisherDomain?.verified) {
				dom.append(this.element, verifiedPublisher);
			}
			dom.append(this.element, publisherDisplayName);
		} else {
			this.element.setAttribute('role', 'button');
			this.element.tabIndex = 0;

			this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, localize('publisher', "Publisher ({0})", this.mcpServer.publisherDisplayName)));
			dom.append(this.element, publisherDisplayName);

			if (this.mcpServer.gallery?.publisherDomain?.verified) {
				dom.append(this.element, verifiedPublisher);
				const publisherDomainLink = URI.parse(this.mcpServer.gallery?.publisherDomain.link);
				verifiedPublisher.tabIndex = 0;
				verifiedPublisher.setAttribute('role', 'button');
				this.containerHover.update(localize('verified publisher', "This publisher has verified ownership of {0}", this.mcpServer.gallery?.publisherDomain.link));
				verifiedPublisher.setAttribute('role', 'link');

				dom.append(verifiedPublisher, dom.$('span.extension-verified-publisher-domain', undefined, publisherDomainLink.authority.startsWith('www.') ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
				this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
			}
		}

	}

}

export class InstallCountWidget extends McpServerWidget {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this.render();

		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.container.innerText = '';
		this.disposables.clear();
	}

	render(): void {
		this.clear();

		if (!this.mcpServer?.installCount) {
			return;
		}

		const installLabel = InstallCountWidget.getInstallLabel(this.mcpServer, this.small);
		if (!installLabel) {
			return;
		}

		const parent = this.small ? this.container : dom.append(this.container, dom.$('span.install', { tabIndex: 0 }));
		dom.append(parent, dom.$('span' + ThemeIcon.asCSSSelector(installCountIcon)));
		const count = dom.append(parent, dom.$('span.count'));
		count.textContent = installLabel;

		if (!this.small) {
			this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.container, localize('install count', "Install count")));
		}
	}

	static getInstallLabel(extension: IWorkbenchMcpServer, small: boolean): string | undefined {
		const installCount = extension.installCount;

		if (!installCount) {
			return undefined;
		}

		let installLabel: string;

		if (small) {
			if (installCount > 1000000) {
				installLabel = `${Math.floor(installCount / 100000) / 10}M`;
			} else if (installCount > 1000) {
				installLabel = `${Math.floor(installCount / 1000)}K`;
			} else {
				installLabel = String(installCount);
			}
		}
		else {
			installLabel = installCount.toLocaleString(platform.language);
		}

		return installLabel;
	}
}

export class RatingsWidget extends McpServerWidget {

	private containerHover: IManagedHover | undefined;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		container.classList.add('extension-ratings');

		if (this.small) {
			container.classList.add('small');
		}

		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.container.innerText = '';
		this.disposables.clear();
	}

	render(): void {
		this.clear();

		if (!this.mcpServer) {
			return;
		}

		if (this.mcpServer.rating === undefined) {
			return;
		}

		if (this.small && !this.mcpServer.ratingCount) {
			return;
		}

		if (!this.mcpServer.url) {
			return;
		}

		const rating = Math.round(this.mcpServer.rating * 2) / 2;
		if (this.small) {
			dom.append(this.container, dom.$('span' + ThemeIcon.asCSSSelector(starFullIcon)));

			const count = dom.append(this.container, dom.$('span.count'));
			count.textContent = String(rating);
		} else {
			const element = dom.append(this.container, dom.$('span.rating.clickable', { tabIndex: 0 }));
			for (let i = 1; i <= 5; i++) {
				if (rating >= i) {
					dom.append(element, dom.$('span' + ThemeIcon.asCSSSelector(starFullIcon)));
				} else if (rating >= i - 0.5) {
					dom.append(element, dom.$('span' + ThemeIcon.asCSSSelector(starHalfIcon)));
				} else {
					dom.append(element, dom.$('span' + ThemeIcon.asCSSSelector(starEmptyIcon)));
				}
			}
			if (this.mcpServer.ratingCount) {
				const ratingCountElement = dom.append(element, dom.$('span', undefined, ` (${this.mcpServer.ratingCount})`));
				ratingCountElement.style.paddingLeft = '1px';
			}

			this.containerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element, ''));
			this.containerHover.update(localize('ratedLabel', "Average rating: {0} out of 5", rating));
			element.setAttribute('role', 'link');
		}
	}

}
