/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { verifiedPublisherIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { Emitter } from '../../../../base/common/event.js';
import { reset } from '../../../../base/browser/dom.js';
import { mcpLicenseIcon, mcpServerIcon, mcpServerRemoteIcon, mcpServerWorkspaceIcon, mcpStarredIcon } from './mcpServerIcons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ExtensionIconBadge } from '../../extensions/browser/extensionsWidgets.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
export class McpServerWidget extends Disposable {
    constructor() {
        super(...arguments);
        this._mcpServer = null;
    }
    get mcpServer() { return this._mcpServer; }
    set mcpServer(mcpServer) { this._mcpServer = mcpServer; this.update(); }
    update() { this.render(); }
}
export function onClick(element, callback) {
    const disposables = new DisposableStore();
    disposables.add(dom.addDisposableListener(element, dom.EventType.CLICK, dom.finalHandler(callback)));
    disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_UP, e => {
        const keyboardEvent = new StandardKeyboardEvent(e);
        if (keyboardEvent.equals(10 /* KeyCode.Space */) || keyboardEvent.equals(3 /* KeyCode.Enter */)) {
            e.preventDefault();
            e.stopPropagation();
            callback();
        }
    }));
    return disposables;
}
let McpServerIconWidget = class McpServerIconWidget extends McpServerWidget {
    constructor(container, themeService) {
        super();
        this.themeService = themeService;
        this.iconLoadingDisposable = this._register(new MutableDisposable());
        this.element = dom.append(container, dom.$('.extension-icon'));
        this.iconElement = dom.append(this.element, dom.$('img.icon', { alt: '' }));
        this.iconElement.style.display = 'none';
        this.codiconIconElement = dom.append(this.element, dom.$(ThemeIcon.asCSSSelector(mcpServerIcon)));
        this.codiconIconElement.style.display = 'none';
        this.render();
        this._register(toDisposable(() => this.clear()));
        this._register(this.themeService.onDidColorThemeChange(() => this.render()));
    }
    clear() {
        this.iconUrl = undefined;
        this.iconElement.src = '';
        this.iconElement.style.display = 'none';
        this.codiconIconElement.style.display = 'none';
        this.codiconIconElement.className = ThemeIcon.asClassName(mcpServerIcon);
        this.iconLoadingDisposable.clear();
    }
    render() {
        if (!this.mcpServer) {
            this.clear();
            return;
        }
        if (this.mcpServer.icon) {
            const type = this.themeService.getColorTheme().type;
            const iconUrl = isDark(type) ? this.mcpServer.icon.dark : this.mcpServer.icon.light;
            if (this.iconUrl !== iconUrl) {
                this.iconElement.style.display = 'inherit';
                this.codiconIconElement.style.display = 'none';
                this.iconUrl = iconUrl;
                this.iconLoadingDisposable.value = dom.addDisposableListener(this.iconElement, 'error', () => {
                    this.iconElement.style.display = 'none';
                    this.codiconIconElement.style.display = 'inherit';
                }, { once: true });
                this.iconElement.src = this.iconUrl;
                if (!this.iconElement.complete) {
                    this.iconElement.style.visibility = 'hidden';
                    this.iconElement.onload = () => this.iconElement.style.visibility = 'inherit';
                }
                else {
                    this.iconElement.style.visibility = 'inherit';
                }
            }
        }
        else {
            this.iconUrl = undefined;
            this.iconElement.style.display = 'none';
            this.iconElement.src = '';
            this.codiconIconElement.className = this.mcpServer.codicon ? `codicon ${this.mcpServer.codicon}` : ThemeIcon.asClassName(mcpServerIcon);
            this.codiconIconElement.style.display = 'inherit';
            this.iconLoadingDisposable.clear();
        }
    }
};
McpServerIconWidget = __decorate([
    __param(1, IThemeService)
], McpServerIconWidget);
export { McpServerIconWidget };
let PublisherWidget = class PublisherWidget extends McpServerWidget {
    constructor(container, small, hoverService, openerService) {
        super();
        this.container = container;
        this.small = small;
        this.hoverService = hoverService;
        this.openerService = openerService;
        this.disposables = this._register(new DisposableStore());
        this.render();
        this._register(toDisposable(() => this.clear()));
    }
    clear() {
        this.element?.remove();
        this.disposables.clear();
    }
    render() {
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
        }
        else {
            this.element.classList.toggle('clickable', !!this.mcpServer.gallery?.publisherUrl);
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
            if (this.mcpServer.gallery?.publisherUrl) {
                this.disposables.add(onClick(this.element, () => this.openerService.open(this.mcpServer?.gallery?.publisherUrl)));
            }
        }
    }
};
PublisherWidget = __decorate([
    __param(2, IHoverService),
    __param(3, IOpenerService)
], PublisherWidget);
export { PublisherWidget };
export class StarredWidget extends McpServerWidget {
    constructor(container, small) {
        super();
        this.container = container;
        this.small = small;
        this.disposables = this._register(new DisposableStore());
        this.container.classList.add('extension-ratings');
        if (this.small) {
            container.classList.add('small');
        }
        this.render();
        this._register(toDisposable(() => this.clear()));
    }
    clear() {
        this.container.innerText = '';
        this.disposables.clear();
    }
    render() {
        this.clear();
        if (!this.mcpServer?.starsCount) {
            return;
        }
        if (this.small && this.mcpServer.installState !== 3 /* McpServerInstallState.Uninstalled */) {
            return;
        }
        const parent = this.small ? this.container : dom.append(this.container, dom.$('span.rating', { tabIndex: 0 }));
        dom.append(parent, dom.$('span' + ThemeIcon.asCSSSelector(mcpStarredIcon)));
        const ratingCountElement = dom.append(parent, dom.$('span.count', undefined, StarredWidget.getCountLabel(this.mcpServer.starsCount)));
        if (!this.small) {
            ratingCountElement.style.paddingLeft = '3px';
        }
    }
    static getCountLabel(starsCount) {
        if (starsCount > 1000000) {
            return `${Math.floor(starsCount / 100000) / 10}M`;
        }
        else if (starsCount > 1000) {
            return `${Math.floor(starsCount / 1000)}K`;
        }
        else {
            return String(starsCount);
        }
    }
}
export class LicenseWidget extends McpServerWidget {
    constructor(container) {
        super();
        this.container = container;
        this.disposables = this._register(new DisposableStore());
        this.container.classList.add('license');
        this.render();
        this._register(toDisposable(() => this.clear()));
    }
    clear() {
        this.container.innerText = '';
        this.disposables.clear();
    }
    render() {
        this.clear();
        if (!this.mcpServer?.license) {
            return;
        }
        const parent = dom.append(this.container, dom.$('span.license', { tabIndex: 0 }));
        dom.append(parent, dom.$('span' + ThemeIcon.asCSSSelector(mcpLicenseIcon)));
        const licenseElement = dom.append(parent, dom.$('span', undefined, this.mcpServer.license));
        licenseElement.style.paddingLeft = '3px';
    }
}
let McpServerHoverWidget = class McpServerHoverWidget extends McpServerWidget {
    constructor(options, mcpServerStatusAction, hoverService, configurationService) {
        super();
        this.options = options;
        this.mcpServerStatusAction = mcpServerStatusAction;
        this.hoverService = hoverService;
        this.configurationService = configurationService;
        this.hover = this._register(new MutableDisposable());
    }
    render() {
        this.hover.value = undefined;
        if (this.mcpServer) {
            this.hover.value = this.hoverService.setupManagedHover({
                delay: this.configurationService.getValue('workbench.hover.delay'),
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
            }, this.options.target, {
                markdown: () => Promise.resolve(this.getHoverMarkdown()),
                markdownNotSupportedFallback: undefined
            }, {
                appearance: {
                    showHoverHint: true
                }
            });
        }
    }
    getHoverMarkdown() {
        if (!this.mcpServer) {
            return undefined;
        }
        const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        markdown.appendMarkdown(`**${this.mcpServer.label}**`);
        markdown.appendText(`\n`);
        let addSeparator = false;
        if (this.mcpServer.local?.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            markdown.appendMarkdown(`$(${mcpServerWorkspaceIcon.id})&nbsp;`);
            markdown.appendMarkdown(localize('workspace extension', "Workspace MCP Server"));
            addSeparator = true;
        }
        if (this.mcpServer.local?.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
            markdown.appendMarkdown(`$(${mcpServerRemoteIcon.id})&nbsp;`);
            markdown.appendMarkdown(localize('remote user extension', "Remote MCP Server"));
            addSeparator = true;
        }
        if (this.mcpServer.installState === 1 /* McpServerInstallState.Installed */) {
            if (this.mcpServer.starsCount) {
                if (addSeparator) {
                    markdown.appendText(`  |  `);
                }
                const starsCountLabel = StarredWidget.getCountLabel(this.mcpServer.starsCount);
                markdown.appendMarkdown(`$(${mcpStarredIcon.id}) ${starsCountLabel}`);
                addSeparator = true;
            }
        }
        if (addSeparator) {
            markdown.appendText(`\n`);
        }
        if (this.mcpServer.description) {
            markdown.appendMarkdown(`${this.mcpServer.description}`);
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
};
McpServerHoverWidget = __decorate([
    __param(2, IHoverService),
    __param(3, IConfigurationService)
], McpServerHoverWidget);
export { McpServerHoverWidget };
let McpServerScopeBadgeWidget = class McpServerScopeBadgeWidget extends McpServerWidget {
    constructor(container, instantiationService) {
        super();
        this.container = container;
        this.instantiationService = instantiationService;
        this.badge = this._register(new MutableDisposable());
        this.element = dom.append(this.container, dom.$(''));
        this.render();
        this._register(toDisposable(() => this.clear()));
    }
    clear() {
        this.badge.value?.element.remove();
        this.badge.clear();
    }
    render() {
        this.clear();
        const scope = this.mcpServer?.local?.scope;
        if (!scope || scope === "user" /* LocalMcpServerScope.User */) {
            return;
        }
        let icon;
        switch (scope) {
            case "workspace" /* LocalMcpServerScope.Workspace */: {
                icon = mcpServerWorkspaceIcon;
                break;
            }
            case "remoteUser" /* LocalMcpServerScope.RemoteUser */: {
                icon = mcpServerRemoteIcon;
                break;
            }
        }
        this.badge.value = this.instantiationService.createInstance(ExtensionIconBadge, icon, undefined);
        dom.append(this.element, this.badge.value.element);
    }
};
McpServerScopeBadgeWidget = __decorate([
    __param(1, IInstantiationService)
], McpServerScopeBadgeWidget);
export { McpServerScopeBadgeWidget };
let McpServerStatusWidget = class McpServerStatusWidget extends McpServerWidget {
    constructor(container, extensionStatusAction, markdownRendererService) {
        super();
        this.container = container;
        this.extensionStatusAction = extensionStatusAction;
        this.markdownRendererService = markdownRendererService;
        this.renderDisposables = this._register(new MutableDisposable());
        this._onDidRender = this._register(new Emitter());
        this.onDidRender = this._onDidRender.event;
        this.render();
        this._register(extensionStatusAction.onDidChangeStatus(() => this.render()));
    }
    render() {
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
            const rendered = disposables.add(this.markdownRendererService.render(markdown));
            dom.append(this.container, rendered.element);
        }
        this._onDidRender.fire();
    }
};
McpServerStatusWidget = __decorate([
    __param(2, IMarkdownRendererService)
], McpServerStatusWidget);
export { McpServerStatusWidget };
export const mcpStarredIconColor = registerColor('mcpIcon.starForeground', { light: '#DF6100', dark: '#FF8E00', hcDark: '#FF8E00', hcLight: textLinkForeground }, localize('mcpIconStarForeground', "The icon color for mcp starred."), false);
registerThemingParticipant((theme, collector) => {
    const mcpStarredIconColorValue = theme.getColor(mcpStarredIconColor);
    if (mcpStarredIconColorValue) {
        collector.addRule(`.extension-ratings .codicon-mcp-server-starred { color: ${mcpStarredIconColorValue}; }`);
        collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(mcpStarredIcon)} { color: ${mcpStarredIconColorValue}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyV2lkZ2V0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlcldpZGdldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVsRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV4RyxPQUFPLEVBQUUsYUFBYSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDOUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7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