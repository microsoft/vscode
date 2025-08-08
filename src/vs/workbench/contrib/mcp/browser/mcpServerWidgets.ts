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
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { verifiedPublisherIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { installCountIcon, starEmptyIcon, starFullIcon, starHalfIcon } from '../../extensions/browser/extensionsIcons.js';
import { IMcpServerContainer, IWorkbenchMcpServer } from '../common/mcpTypes.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { McpServerStatusAction } from './mcpServerActions.js';
import { reset } from '../../../../base/browser/dom.js';
import { mcpServerIcon, mcpServerRemoteIcon, mcpServerWorkspaceIcon } from './mcpServerIcons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { ExtensionHoverOptions, ExtensionIconBadge } from '../../extensions/browser/extensionsWidgets.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { LocalMcpServerScope } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

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
	private readonly codiconIconElement: HTMLElement;

	private iconUrl: string | undefined;

	constructor(
		container: HTMLElement,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
		this.element = dom.append(container, dom.$('.extension-icon'));

		this.iconElement = dom.append(this.element, dom.$('img.icon', { alt: '' }));
		this.iconElement.style.display = 'none';

		this.codiconIconElement = dom.append(this.element, dom.$(ThemeIcon.asCSSSelector(mcpServerIcon)));
		this.codiconIconElement.style.display = 'none';

		this.render();
		this._register(toDisposable(() => this.clear()));
		this._register(this.themeService.onDidColorThemeChange(() => this.render()));
	}

	private clear(): void {
		this.iconUrl = undefined;
		this.iconElement.src = '';
		this.iconElement.style.display = 'none';
		this.codiconIconElement.style.display = 'none';
		this.codiconIconElement.className = ThemeIcon.asClassName(mcpServerIcon);
		this.disposables.clear();
	}

	render(): void {
		if (!this.mcpServer) {
			this.clear();
			return;
		}

		if (this.mcpServer.icon) {
			this.iconElement.style.display = 'inherit';
			this.codiconIconElement.style.display = 'none';
			const type = this.themeService.getColorTheme().type;
			const iconUrl = type === ColorScheme.DARK || ColorScheme.HIGH_CONTRAST_DARK ? this.mcpServer.icon.dark : this.mcpServer.icon.light;
			if (this.iconUrl !== iconUrl) {
				this.iconUrl = iconUrl;
				this.disposables.add(dom.addDisposableListener(this.iconElement, 'error', () => {
					this.iconElement.style.display = 'none';
					this.codiconIconElement.style.display = 'inherit';
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
			this.codiconIconElement.className = this.mcpServer.codicon ? `codicon ${this.mcpServer.codicon}` : ThemeIcon.asClassName(mcpServerIcon);
			this.codiconIconElement.style.display = 'inherit';
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

export class McpServerHoverWidget extends McpServerWidget {

	private readonly hover = this._register(new MutableDisposable<IDisposable>());

	constructor(
		private readonly options: ExtensionHoverOptions,
		private readonly mcpServerStatusAction: McpServerStatusAction,
		@IHoverService private readonly hoverService: IHoverService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	render(): void {
		this.hover.value = undefined;
		if (this.mcpServer) {
			this.hover.value = this.hoverService.setupManagedHover({
				delay: this.configurationService.getValue<number>('workbench.hover.delay'),
				showHover: (options, focus) => {
					return this.hoverService.showInstantHover({
						...options,
						additionalClasses: ['extension-hover'],
						position: {
							hoverPosition: this.options.position(),
							forcePosition: true,
						},
						persistence: {
							hideOnKeyDown: true,
						}
					}, focus);
				},
				placement: 'element'
			},
				this.options.target,
				{
					markdown: () => Promise.resolve(this.getHoverMarkdown()),
					markdownNotSupportedFallback: undefined
				},
				{
					appearance: {
						showHoverHint: true
					}
				}
			);
		}
	}

	private getHoverMarkdown(): MarkdownString | undefined {
		if (!this.mcpServer) {
			return undefined;
		}
		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });

		markdown.appendMarkdown(`**${this.mcpServer.label}**`);
		markdown.appendText(`\n`);

		if (this.mcpServer.local?.scope === LocalMcpServerScope.Workspace) {
			markdown.appendMarkdown(`$(${mcpServerWorkspaceIcon.id})&nbsp;`);
			markdown.appendMarkdown(localize('workspace extension', "Workspace MCP Server"));
			markdown.appendText(`\n`);
		}

		if (this.mcpServer.local?.scope === LocalMcpServerScope.RemoteUser) {
			markdown.appendMarkdown(`$(${mcpServerRemoteIcon.id})&nbsp;`);
			markdown.appendMarkdown(localize('remote user extension', "Remote MCP Server"));
			markdown.appendText(`\n`);
		}

		if (this.mcpServer.description) {
			markdown.appendMarkdown(`${this.mcpServer.description}`);
			markdown.appendText(`\n`);
		}

		const extensionStatus = this.mcpServerStatusAction.status;

		if (extensionStatus.length) {

			markdown.appendMarkdown(`---`);
			markdown.appendText(`\n`);

			for (const status of extensionStatus) {
				if (status.icon) {
					markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
				}
				markdown.appendMarkdown(status.message.value);
				markdown.appendText(`\n`);
			}

		}

		return markdown;
	}

}

export class McpServerScopeBadgeWidget extends McpServerWidget {

	private readonly badge = this._register(new MutableDisposable<ExtensionIconBadge>());
	private element: HTMLElement;

	constructor(
		readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.element = dom.append(this.container, dom.$(''));
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.badge.value?.element.remove();
		this.badge.clear();
	}

	render(): void {
		this.clear();

		const scope = this.mcpServer?.local?.scope;

		if (!scope || scope === LocalMcpServerScope.User) {
			return;
		}

		let icon: ThemeIcon;
		switch (scope) {
			case LocalMcpServerScope.Workspace: {
				icon = mcpServerWorkspaceIcon;
				break;
			}
			case LocalMcpServerScope.RemoteUser: {
				icon = mcpServerRemoteIcon;
				break;
			}
		}

		this.badge.value = this.instantiationService.createInstance(ExtensionIconBadge, icon, undefined);
		dom.append(this.element, this.badge.value.element);
	}
}

export class McpServerStatusWidget extends McpServerWidget {

	private readonly renderDisposables = this._register(new MutableDisposable());

	private readonly _onDidRender = this._register(new Emitter<void>());
	readonly onDidRender: Event<void> = this._onDidRender.event;

	constructor(
		private readonly container: HTMLElement,
		private readonly extensionStatusAction: McpServerStatusAction,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.render();
		this._register(extensionStatusAction.onDidChangeStatus(() => this.render()));
	}

	render(): void {
		reset(this.container);
		this.renderDisposables.value = undefined;
		const disposables = new DisposableStore();
		this.renderDisposables.value = disposables;
		const extensionStatus = this.extensionStatusAction.status;
		if (extensionStatus.length) {
			const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
			for (let i = 0; i < extensionStatus.length; i++) {
				const status = extensionStatus[i];
				if (status.icon) {
					markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
				}
				markdown.appendMarkdown(status.message.value);
				if (i < extensionStatus.length - 1) {
					markdown.appendText(`\n`);
				}
			}
			const rendered = disposables.add(renderMarkdown(markdown, {
				actionHandler: {
					callback: (content) => {
						this.openerService.open(content, { allowCommands: true }).catch(onUnexpectedError);
					},
					disposables
				}
			}));
			dom.append(this.container, rendered.element);
		}
		this._onDidRender.fire();
	}
}
