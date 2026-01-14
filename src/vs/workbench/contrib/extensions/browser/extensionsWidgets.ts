/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/extensionsWidgets.css';
import * as semver from '../../../../base/common/semver/semver.js';
import { Disposable, toDisposable, DisposableStore, MutableDisposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IExtension, IExtensionsWorkbenchService, IExtensionContainer, ExtensionState, ExtensionEditorTab, IExtensionsViewState } from '../common/extensions.js';
import { append, $, reset, addDisposableListener, EventType, finalHandler } from '../../../../base/browser/dom.js';
import * as platform from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { extensionButtonProminentBackground, ExtensionStatusAction } from './extensionsActions.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { EXTENSION_BADGE_BACKGROUND, EXTENSION_BADGE_FOREGROUND } from '../../../common/theme.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { activationTimeIcon, errorIcon, infoIcon, installCountIcon, preReleaseIcon, privateExtensionIcon, ratingIcon, remoteIcon, sponsorIcon, starEmptyIcon, starFullIcon, starHalfIcon, syncIgnoredIcon, warningIcon } from './extensionsIcons.js';
import { registerColor, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { createCommandUri, MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import Severity from '../../../../base/common/severity.js';
import { Color } from '../../../../base/common/color.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { extensionDefaultIcon, extensionVerifiedPublisherIconColor, verifiedPublisherIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExplorerService } from '../../files/browser/files.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VIEW_ID as EXPLORER_VIEW_ID } from '../../files/common/files.js';
import { IExtensionGalleryManifest, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';

export abstract class ExtensionWidget extends Disposable implements IExtensionContainer {
	private _extension: IExtension | null = null;
	get extension(): IExtension | null { return this._extension; }
	set extension(extension: IExtension | null) { this._extension = extension; this.update(); }
	update(): void { this.render(); }
	abstract render(): void;
}

export function onClick(element: HTMLElement, callback: () => void): IDisposable {
	const disposables: DisposableStore = new DisposableStore();
	disposables.add(addDisposableListener(element, EventType.CLICK, finalHandler(callback)));
	disposables.add(addDisposableListener(element, EventType.KEY_UP, e => {
		const keyboardEvent = new StandardKeyboardEvent(e);
		if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
			e.preventDefault();
			e.stopPropagation();
			callback();
		}
	}));
	return disposables;
}

export class ExtensionIconWidget extends ExtensionWidget {

	private readonly iconLoadingDisposable = this._register(new MutableDisposable());
	private readonly iconErrorDisposable = this._register(new MutableDisposable());
	private readonly element: HTMLElement;
	private readonly iconElement: HTMLImageElement;
	private readonly defaultIconElement: HTMLElement;

	private iconUrl: string | undefined;

	constructor(
		container: HTMLElement,
	) {
		super();
		this.element = append(container, $('.extension-icon'));

		this.iconElement = append(this.element, $('img.icon', { alt: '' }));
		this.iconElement.style.display = 'none';

		this.defaultIconElement = append(this.element, $(ThemeIcon.asCSSSelector(extensionDefaultIcon)));
		this.defaultIconElement.style.display = 'none';

		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.iconUrl = undefined;
		this.iconElement.src = '';
		this.iconElement.style.display = 'none';
		this.defaultIconElement.style.display = 'none';
		this.iconErrorDisposable.clear();
		this.iconLoadingDisposable.clear();
	}

	render(): void {
		if (!this.extension) {
			this.clear();
			return;
		}

		if (this.extension.iconUrl) {
			if (this.iconUrl !== this.extension.iconUrl) {
				this.iconElement.style.display = 'inherit';
				this.defaultIconElement.style.display = 'none';
				this.iconUrl = this.extension.iconUrl;
				this.iconErrorDisposable.value = addDisposableListener(this.iconElement, 'error', () => {
					if (this.extension?.iconUrlFallback) {
						this.iconElement.src = this.extension.iconUrlFallback;
					} else {
						this.iconElement.style.display = 'none';
						this.defaultIconElement.style.display = 'inherit';
					}
				}, { once: true });
				this.iconElement.src = this.iconUrl;
				if (!this.iconElement.complete) {
					this.iconElement.style.visibility = 'hidden';
					this.iconLoadingDisposable.value = addDisposableListener(this.iconElement, 'load', () => {
						this.iconElement.style.visibility = 'inherit';
					});
				} else {
					this.iconElement.style.visibility = 'inherit';
				}
			}
		} else {
			this.iconUrl = undefined;
			this.iconElement.style.display = 'none';
			this.iconElement.src = '';
			this.defaultIconElement.style.display = 'inherit';
			this.iconErrorDisposable.clear();
			this.iconLoadingDisposable.clear();
		}
	}
}

export class InstallCountWidget extends ExtensionWidget {

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

		if (!this.extension) {
			return;
		}

		if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
			return;
		}

		const installLabel = InstallCountWidget.getInstallLabel(this.extension, this.small);
		if (!installLabel) {
			return;
		}

		const parent = this.small ? this.container : append(this.container, $('span.install', { tabIndex: 0 }));
		append(parent, $('span' + ThemeIcon.asCSSSelector(installCountIcon)));
		const count = append(parent, $('span.count'));
		count.textContent = installLabel;

		if (!this.small) {
			this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.container, localize('install count', "Install count")));
		}
	}

	static getInstallLabel(extension: IExtension, small: boolean): string | undefined {
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

export class RatingsWidget extends ExtensionWidget {

	private containerHover: IManagedHover | undefined;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
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

		if (!this.extension) {
			return;
		}

		if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
			return;
		}

		if (this.extension.rating === undefined) {
			return;
		}

		if (this.small && !this.extension.ratingCount) {
			return;
		}

		if (!this.extension.url) {
			return;
		}

		const rating = Math.round(this.extension.rating * 2) / 2;
		if (this.small) {
			append(this.container, $('span' + ThemeIcon.asCSSSelector(starFullIcon)));

			const count = append(this.container, $('span.count'));
			count.textContent = String(rating);
		} else {
			const element = append(this.container, $('span.rating.clickable', { tabIndex: 0 }));
			for (let i = 1; i <= 5; i++) {
				if (rating >= i) {
					append(element, $('span' + ThemeIcon.asCSSSelector(starFullIcon)));
				} else if (rating >= i - 0.5) {
					append(element, $('span' + ThemeIcon.asCSSSelector(starHalfIcon)));
				} else {
					append(element, $('span' + ThemeIcon.asCSSSelector(starEmptyIcon)));
				}
			}
			if (this.extension.ratingCount) {
				const ratingCountElemet = append(element, $('span', undefined, ` (${this.extension.ratingCount})`));
				ratingCountElemet.style.paddingLeft = '1px';
			}

			this.containerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element, ''));
			this.containerHover.update(localize('ratedLabel', "Average rating: {0} out of 5", rating));
			element.setAttribute('role', 'link');
			if (this.extension.ratingUrl) {
				this.disposables.add(onClick(element, () => this.openerService.open(URI.parse(this.extension!.ratingUrl!))));
			}
		}
	}

}

export class PublisherWidget extends ExtensionWidget {

	private element: HTMLElement | undefined;
	private containerHover: IManagedHover | undefined;

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
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
		if (!this.extension) {
			return;
		}

		if (this.extension.resourceExtension) {
			return;
		}

		if (this.extension.local?.source === 'resource') {
			return;
		}

		this.element = append(this.container, $('.publisher'));
		const publisherDisplayName = $('.publisher-name.ellipsis');
		publisherDisplayName.textContent = this.extension.publisherDisplayName;

		const verifiedPublisher = $('.verified-publisher');
		append(verifiedPublisher, $('span.extension-verified-publisher.clickable'), renderIcon(verifiedPublisherIcon));

		if (this.small) {
			if (this.extension.publisherDomain?.verified) {
				append(this.element, verifiedPublisher);
			}
			append(this.element, publisherDisplayName);
		} else {
			this.element.classList.toggle('clickable', !!this.extension.url);
			this.element.setAttribute('role', 'button');
			this.element.tabIndex = 0;

			this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, localize('publisher', "Publisher ({0})", this.extension.publisherDisplayName)));
			append(this.element, publisherDisplayName);

			if (this.extension.publisherDomain?.verified) {
				append(this.element, verifiedPublisher);
				const publisherDomainLink = URI.parse(this.extension.publisherDomain.link);
				verifiedPublisher.tabIndex = 0;
				verifiedPublisher.setAttribute('role', 'button');
				this.containerHover.update(localize('verified publisher', "This publisher has verified ownership of {0}", this.extension.publisherDomain.link));
				verifiedPublisher.setAttribute('role', 'link');

				append(verifiedPublisher, $('span.extension-verified-publisher-domain', undefined, publisherDomainLink.authority.startsWith('www.') ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
				this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
			}

			if (this.extension.url) {
				this.disposables.add(onClick(this.element, () => this.extensionsWorkbenchService.openSearch(`publisher:"${this.extension?.publisherDisplayName}"`)));
			}
		}

	}

}

export class SponsorWidget extends ExtensionWidget {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.render();
	}

	render(): void {
		reset(this.container);
		this.disposables.clear();
		if (!this.extension?.publisherSponsorLink) {
			return;
		}

		const sponsor = append(this.container, $('span.sponsor.clickable', { tabIndex: 0 }));
		this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), sponsor, this.extension?.publisherSponsorLink.toString() ?? ''));
		sponsor.setAttribute('role', 'link'); // #132645
		const sponsorIconElement = renderIcon(sponsorIcon);
		const label = $('span', undefined, localize('sponsor', "Sponsor"));
		append(sponsor, sponsorIconElement, label);
		this.disposables.add(onClick(sponsor, () => {
			this.openerService.open(this.extension!.publisherSponsorLink!);
		}));
	}
}

export class RecommendationWidget extends ExtensionWidget {

	private element?: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private parent: HTMLElement,
		@IExtensionRecommendationsService private readonly extensionRecommendationsService: IExtensionRecommendationsService
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
		this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
	}

	private clear(): void {
		this.element?.remove();
		this.element = undefined;
		this.disposables.clear();
	}

	render(): void {
		this.clear();
		if (!this.extension || this.extension.state === ExtensionState.Installed || this.extension.deprecationInfo) {
			return;
		}
		const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
		if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
			this.element = append(this.parent, $('div.extension-bookmark'));
			const recommendation = append(this.element, $('.recommendation'));
			append(recommendation, $('span' + ThemeIcon.asCSSSelector(ratingIcon)));
		}
	}

}

export class PreReleaseBookmarkWidget extends ExtensionWidget {

	private element?: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private parent: HTMLElement,
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.element?.remove();
		this.element = undefined;
		this.disposables.clear();
	}

	render(): void {
		this.clear();
		if (this.extension?.state === ExtensionState.Installed ? this.extension.preRelease : this.extension?.hasPreReleaseVersion) {
			this.element = append(this.parent, $('div.extension-bookmark'));
			const preRelease = append(this.element, $('.pre-release'));
			append(preRelease, $('span' + ThemeIcon.asCSSSelector(preReleaseIcon)));
		}
	}

}

export class RemoteBadgeWidget extends ExtensionWidget {

	private readonly remoteBadge = this._register(new MutableDisposable<ExtensionIconBadge>());

	private element: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly tooltip: boolean,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.element = append(parent, $(''));
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.remoteBadge.value?.element.remove();
		this.remoteBadge.clear();
	}

	render(): void {
		this.clear();
		if (!this.extension || !this.extension.local || !this.extension.server || !(this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) || this.extension.server !== this.extensionManagementServerService.remoteExtensionManagementServer) {
			return;
		}
		let tooltip: string | undefined;
		if (this.tooltip && this.extensionManagementServerService.remoteExtensionManagementServer) {
			tooltip = localize('remote extension title', "Extension in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label);
		}
		this.remoteBadge.value = this.instantiationService.createInstance(ExtensionIconBadge, remoteIcon, tooltip);
		append(this.element, this.remoteBadge.value.element);
	}
}

export class ExtensionIconBadge extends Disposable {

	readonly element: HTMLElement;
	readonly elementHover: IManagedHover;

	constructor(
		private readonly icon: ThemeIcon,
		private readonly tooltip: string | undefined,
		@IHoverService hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this.element = $('div.extension-badge.extension-icon-badge');
		this.elementHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, ''));
		this.render();
	}

	private render(): void {
		append(this.element, $('span' + ThemeIcon.asCSSSelector(this.icon)));

		const applyBadgeStyle = () => {
			if (!this.element) {
				return;
			}
			const bgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_BACKGROUND);
			const fgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_FOREGROUND);
			this.element.style.backgroundColor = bgColor ? bgColor.toString() : '';
			this.element.style.color = fgColor ? fgColor.toString() : '';
		};
		applyBadgeStyle();
		this._register(this.themeService.onDidColorThemeChange(() => applyBadgeStyle()));

		if (this.tooltip) {
			const updateTitle = () => {
				if (this.element) {
					this.elementHover.update(this.tooltip);
				}
			};
			this._register(this.labelService.onDidChangeFormatters(() => updateTitle()));
			updateTitle();
		}
	}
}

export class ExtensionPackCountWidget extends ExtensionWidget {

	private element: HTMLElement | undefined;
	private countBadge: CountBadge | undefined;

	constructor(
		private readonly parent: HTMLElement,
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.element?.remove();
		this.countBadge?.dispose();
		this.countBadge = undefined;
	}

	render(): void {
		this.clear();
		if (!this.extension || !(this.extension.categories?.some(category => category.toLowerCase() === 'extension packs')) || !this.extension.extensionPack.length) {
			return;
		}
		this.element = append(this.parent, $('.extension-badge.extension-pack-badge'));
		this.countBadge = new CountBadge(this.element, {}, defaultCountBadgeStyles);
		this.countBadge.setCount(this.extension.extensionPack.length);
	}
}

export class ExtensionKindIndicatorWidget extends ExtensionWidget {

	private element: HTMLElement | undefined;
	private extensionGalleryManifest: IExtensionGalleryManifest | null = null;

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		readonly container: HTMLElement,
		private small: boolean,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionGalleryManifestService extensionGalleryManifestService: IExtensionGalleryManifestService,
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
		extensionGalleryManifestService.getExtensionGalleryManifest().then(manifest => {
			if (this._store.isDisposed) {
				return;
			}
			this.extensionGalleryManifest = manifest;
			this.render();
		});
	}

	private clear(): void {
		this.element?.remove();
		this.disposables.clear();
	}

	render(): void {
		this.clear();

		if (!this.extension) {
			return;
		}

		if (this.extension?.private) {
			this.element = append(this.container, $('.extension-kind-indicator'));
			if (!this.small || (this.extensionGalleryManifest?.capabilities.extensions?.includePublicExtensions && this.extensionGalleryManifest?.capabilities.extensions?.includePrivateExtensions)) {
				append(this.element, $('span' + ThemeIcon.asCSSSelector(privateExtensionIcon)));
			}
			if (!this.small) {
				append(this.element, $('span.private-extension-label', undefined, localize('privateExtension', "Private Extension")));
			}
			return;
		}

		if (!this.small) {
			return;
		}

		const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === 'resource' ? this.extension.local?.location : undefined);
		if (!location) {
			return;
		}

		this.element = append(this.container, $('.extension-kind-indicator'));
		const workspaceFolder = this.contextService.getWorkspaceFolder(location);
		if (workspaceFolder && this.extension.isWorkspaceScoped) {
			this.element.textContent = localize('workspace extension', "Workspace Extension");
			this.element.classList.add('clickable');
			this.element.setAttribute('role', 'button');
			this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, this.uriIdentityService.extUri.relativePath(workspaceFolder.uri, location)));
			this.disposables.add(onClick(this.element, () => {
				this.viewsService.openView(EXPLORER_VIEW_ID, true).then(() => this.explorerService.select(location, true));
			}));
		} else {
			this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, location.path));
			this.element.textContent = localize('local extension', "Local Extension");
		}
	}
}

export class SyncIgnoredWidget extends ExtensionWidget {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IHoverService private readonly hoverService: IHoverService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
	) {
		super();
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('settingsSync.ignoredExtensions'))(() => this.render()));
		this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
		this.render();
	}

	render(): void {
		this.disposables.clear();
		this.container.innerText = '';

		if (this.extension && this.extension.state === ExtensionState.Installed && this.userDataSyncEnablementService.isEnabled() && this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension)) {
			const element = append(this.container, $('span.extension-sync-ignored' + ThemeIcon.asCSSSelector(syncIgnoredIcon)));
			this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element, localize('syncingore.label', "This extension is ignored during sync.")));
			element.classList.add(...ThemeIcon.asClassNameArray(syncIgnoredIcon));
		}
	}
}

export class ExtensionRuntimeStatusWidget extends ExtensionWidget {

	constructor(
		private readonly extensionViewState: IExtensionsViewState,
		private readonly container: HTMLElement,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super();
		this._register(extensionService.onDidChangeExtensionsStatus(extensions => {
			if (this.extension && extensions.some(e => areSameExtensions({ id: e.value }, this.extension!.identifier))) {
				this.update();
			}
		}));
		this._register(extensionFeaturesManagementService.onDidChangeAccessData(e => {
			if (this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, e.extension)) {
				this.update();
			}
		}));
	}

	render(): void {
		this.container.innerText = '';

		if (!this.extension) {
			return;
		}

		if (this.extensionViewState.filters.featureId && this.extension.state === ExtensionState.Installed) {
			const accessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id)).get(this.extensionViewState.filters.featureId);
			const feature = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(this.extensionViewState.filters.featureId);
			if (feature?.icon && accessData) {
				const featureAccessTimeElement = append(this.container, $('span.activationTime'));
				featureAccessTimeElement.textContent = localize('feature access label', "{0} reqs", accessData.accessTimes.length);
				const iconElement = append(this.container, $('span' + ThemeIcon.asCSSSelector(feature.icon)));
				iconElement.style.paddingLeft = '4px';
				return;
			}
		}

		const extensionStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
		if (extensionStatus?.activationTimes) {
			const activationTime = extensionStatus.activationTimes.codeLoadingTime + extensionStatus.activationTimes.activateCallTime;
			append(this.container, $('span' + ThemeIcon.asCSSSelector(activationTimeIcon)));
			const activationTimeElement = append(this.container, $('span.activationTime'));
			activationTimeElement.textContent = `${activationTime}ms`;
		}
	}

}

export type ExtensionHoverOptions = {
	position: () => HoverPosition;
	readonly target: HTMLElement;
};

export class ExtensionHoverWidget extends ExtensionWidget {

	private readonly hover = this._register(new MutableDisposable<IDisposable>());

	constructor(
		private readonly options: ExtensionHoverOptions,
		private readonly extensionStatusAction: ExtensionStatusAction,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IHoverService private readonly hoverService: IHoverService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionRecommendationsService private readonly extensionRecommendationsService: IExtensionRecommendationsService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();
	}

	render(): void {
		this.hover.value = undefined;
		if (this.extension) {
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
		if (!this.extension) {
			return undefined;
		}
		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });

		markdown.appendMarkdown(`**${this.extension.displayName}**`);
		if (semver.valid(this.extension.version)) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.version}${(this.extension.isPreReleaseVersion ? ' (pre-release)' : '')}_**&nbsp;</span>`);
		}
		markdown.appendText(`\n`);

		let addSeparator = false;
		if (this.extension.private) {
			markdown.appendMarkdown(`$(${privateExtensionIcon.id}) ${localize('privateExtension', "Private Extension")}`);
			addSeparator = true;
		}
		if (this.extension.state === ExtensionState.Installed) {
			const installLabel = InstallCountWidget.getInstallLabel(this.extension, true);
			if (installLabel) {
				if (addSeparator) {
					markdown.appendText(`  |  `);
				}
				markdown.appendMarkdown(`$(${installCountIcon.id}) ${installLabel}`);
				addSeparator = true;
			}
			if (this.extension.rating) {
				if (addSeparator) {
					markdown.appendText(`  |  `);
				}
				const rating = Math.round(this.extension.rating * 2) / 2;
				markdown.appendMarkdown(`$(${starFullIcon.id}) [${rating}](${this.extension.url}&ssr=false#review-details)`);
				addSeparator = true;
			}
			if (this.extension.publisherSponsorLink) {
				if (addSeparator) {
					markdown.appendText(`  |  `);
				}
				markdown.appendMarkdown(`$(${sponsorIcon.id}) [${localize('sponsor', "Sponsor")}](${this.extension.publisherSponsorLink})`);
				addSeparator = true;
			}
		}
		if (addSeparator) {
			markdown.appendText(`\n`);
		}

		const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === 'resource' ? this.extension.local?.location : undefined);
		if (location) {
			if (this.extension.isWorkspaceScoped && this.contextService.isInsideWorkspace(location)) {
				markdown.appendMarkdown(localize('workspace extension', "Workspace Extension"));
			} else {
				markdown.appendMarkdown(localize('local extension', "Local Extension"));
			}
			markdown.appendText(`\n`);
		}

		if (this.extension.description) {
			markdown.appendMarkdown(`${this.extension.description}`);
			markdown.appendText(`\n`);
		}

		if (this.extension.publisherDomain?.verified) {
			const bgColor = this.themeService.getColorTheme().getColor(extensionVerifiedPublisherIconColor);
			const publisherVerifiedTooltip = localize('publisher verified tooltip', "This publisher has verified ownership of {0}", `[${URI.parse(this.extension.publisherDomain.link).authority}](${this.extension.publisherDomain.link})`);
			markdown.appendMarkdown(`<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : '#ffffff'};">$(${verifiedPublisherIcon.id})</span>&nbsp;${publisherVerifiedTooltip}`);
			markdown.appendText(`\n`);
		}

		if (this.extension.outdated) {
			markdown.appendMarkdown(localize('updateRequired', "Latest version:"));
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.latestVersion}_**&nbsp;</span>`);
			markdown.appendText(`\n`);
		}

		const preReleaseMessage = ExtensionHoverWidget.getPreReleaseMessage(this.extension);
		const extensionRuntimeStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
		const extensionFeaturesAccessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id));
		const extensionStatus = this.extensionStatusAction.status;
		const runtimeState = this.extension.runtimeState;
		const recommendationMessage = this.getRecommendationMessage(this.extension);

		if (extensionRuntimeStatus || extensionFeaturesAccessData.size || extensionStatus.length || runtimeState || recommendationMessage || preReleaseMessage) {

			markdown.appendMarkdown(`---`);
			markdown.appendText(`\n`);

			if (extensionRuntimeStatus) {
				if (extensionRuntimeStatus.activationTimes) {
					const activationTime = extensionRuntimeStatus.activationTimes.codeLoadingTime + extensionRuntimeStatus.activationTimes.activateCallTime;
					markdown.appendMarkdown(`${localize('activation', "Activation time")}${extensionRuntimeStatus.activationTimes.activationReason.startup ? ` (${localize('startup', "Startup")})` : ''}: \`${activationTime}ms\``);
					markdown.appendText(`\n`);
				}
				if (extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.length) {
					const hasErrors = extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.some(message => message.type === Severity.Error);
					const hasWarnings = extensionRuntimeStatus.messages.some(message => message.type === Severity.Warning);
					const errorsLink = extensionRuntimeStatus.runtimeErrors.length ? `[${extensionRuntimeStatus.runtimeErrors.length === 1 ? localize('uncaught error', '1 uncaught error') : localize('uncaught errors', '{0} uncaught errors', extensionRuntimeStatus.runtimeErrors.length)}](${createCommandUri('extension.open', this.extension.identifier.id, ExtensionEditorTab.Features)})` : undefined;
					const messageLink = extensionRuntimeStatus.messages.length ? `[${extensionRuntimeStatus.messages.length === 1 ? localize('message', '1 message') : localize('messages', '{0} messages', extensionRuntimeStatus.messages.length)}](${createCommandUri('extension.open', this.extension.identifier.id, ExtensionEditorTab.Features)})` : undefined;
					markdown.appendMarkdown(`$(${hasErrors ? errorIcon.id : hasWarnings ? warningIcon.id : infoIcon.id}) This extension has reported `);
					if (errorsLink && messageLink) {
						markdown.appendMarkdown(`${errorsLink} and ${messageLink}`);
					} else {
						markdown.appendMarkdown(`${errorsLink || messageLink}`);
					}
					markdown.appendText(`\n`);
				}
			}

			if (extensionFeaturesAccessData.size) {
				const registry = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry);
				for (const [featureId, accessData] of extensionFeaturesAccessData) {
					if (accessData?.accessTimes.length) {
						const feature = registry.getExtensionFeature(featureId);
						if (feature) {
							markdown.appendMarkdown(localize('feature usage label', "{0} usage", feature.label));
							markdown.appendMarkdown(`: [${localize('total', "{0} {1} requests in last 30 days", accessData.accessTimes.length, feature.accessDataLabel ?? feature.label)}](${createCommandUri('extension.open', this.extension.identifier.id, ExtensionEditorTab.Features)})`);
							markdown.appendText(`\n`);
						}
					}
				}
			}

			for (const status of extensionStatus) {
				if (status.icon) {
					markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
				}
				markdown.appendMarkdown(status.message.value);
				markdown.appendText(`\n`);
			}

			if (runtimeState) {
				markdown.appendMarkdown(`$(${infoIcon.id})&nbsp;`);
				markdown.appendMarkdown(`${runtimeState.reason}`);
				markdown.appendText(`\n`);
			}

			if (preReleaseMessage) {
				const extensionPreReleaseIcon = this.themeService.getColorTheme().getColor(extensionPreReleaseIconColor);
				markdown.appendMarkdown(`<span style="color:${extensionPreReleaseIcon ? Color.Format.CSS.formatHex(extensionPreReleaseIcon) : '#ffffff'};">$(${preReleaseIcon.id})</span>&nbsp;${preReleaseMessage}`);
				markdown.appendText(`\n`);
			}

			if (recommendationMessage) {
				markdown.appendMarkdown(recommendationMessage);
				markdown.appendText(`\n`);
			}
		}

		return markdown;
	}

	private getRecommendationMessage(extension: IExtension): string | undefined {
		if (extension.state === ExtensionState.Installed) {
			return undefined;
		}
		if (extension.deprecationInfo) {
			return undefined;
		}
		const recommendation = this.extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()];
		if (!recommendation?.reasonText) {
			return undefined;
		}
		const bgColor = this.themeService.getColorTheme().getColor(extensionButtonProminentBackground);
		return `<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : '#ffffff'};">$(${starEmptyIcon.id})</span>&nbsp;${recommendation.reasonText}`;
	}

	static getPreReleaseMessage(extension: IExtension): string | undefined {
		if (!extension.hasPreReleaseVersion) {
			return undefined;
		}
		if (extension.isBuiltin) {
			return undefined;
		}
		if (extension.isPreReleaseVersion) {
			return undefined;
		}
		if (extension.preRelease) {
			return undefined;
		}
		const preReleaseVersionLink = `[${localize('Show prerelease version', "Pre-Release version")}](${createCommandUri('workbench.extensions.action.showPreReleaseVersion', extension.identifier.id)})`;
		return localize('has prerelease', "This extension has a {0} available", preReleaseVersionLink);
	}

}

export class ExtensionStatusWidget extends ExtensionWidget {

	private readonly renderDisposables = this._register(new MutableDisposable());

	private readonly _onDidRender = this._register(new Emitter<void>());
	readonly onDidRender: Event<void> = this._onDidRender.event;

	constructor(
		private readonly container: HTMLElement,
		private readonly extensionStatusAction: ExtensionStatusAction,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
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
			const rendered = disposables.add(this.markdownRendererService.render(markdown));
			append(this.container, rendered.element);
		}
		this._onDidRender.fire();
	}
}

export class ExtensionRecommendationWidget extends ExtensionWidget {

	private readonly _onDidRender = this._register(new Emitter<void>());
	readonly onDidRender: Event<void> = this._onDidRender.event;

	constructor(
		private readonly container: HTMLElement,
		@IExtensionRecommendationsService private readonly extensionRecommendationsService: IExtensionRecommendationsService,
		@IExtensionIgnoredRecommendationsService private readonly extensionIgnoredRecommendationsService: IExtensionIgnoredRecommendationsService,
	) {
		super();
		this.render();
		this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
	}

	render(): void {
		reset(this.container);
		const recommendationStatus = this.getRecommendationStatus();
		if (recommendationStatus) {
			if (recommendationStatus.icon) {
				append(this.container, $(`div${ThemeIcon.asCSSSelector(recommendationStatus.icon)}`));
			}
			append(this.container, $(`div.recommendation-text`, undefined, recommendationStatus.message));
		}
		this._onDidRender.fire();
	}

	private getRecommendationStatus(): { icon: ThemeIcon | undefined; message: string } | undefined {
		if (!this.extension
			|| this.extension.deprecationInfo
			|| this.extension.state === ExtensionState.Installed
		) {
			return undefined;
		}
		const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
		if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
			const reasonText = extRecommendations[this.extension.identifier.id.toLowerCase()].reasonText;
			if (reasonText) {
				return { icon: starEmptyIcon, message: reasonText };
			}
		} else if (this.extensionIgnoredRecommendationsService.globalIgnoredRecommendations.indexOf(this.extension.identifier.id.toLowerCase()) !== -1) {
			return { icon: undefined, message: localize('recommendationHasBeenIgnored', "You have chosen not to receive recommendations for this extension.") };
		}
		return undefined;
	}
}

export const extensionRatingIconColor = registerColor('extensionIcon.starForeground', { light: '#DF6100', dark: '#FF8E00', hcDark: '#FF8E00', hcLight: textLinkForeground }, localize('extensionIconStarForeground', "The icon color for extension ratings."), false);
export const extensionPreReleaseIconColor = registerColor('extensionIcon.preReleaseForeground', { dark: '#1d9271', light: '#1d9271', hcDark: '#1d9271', hcLight: textLinkForeground }, localize('extensionPreReleaseForeground', "The icon color for pre-release extension."), false);
export const extensionSponsorIconColor = registerColor('extensionIcon.sponsorForeground', { light: '#B51E78', dark: '#D758B3', hcDark: null, hcLight: '#B51E78' }, localize('extensionIcon.sponsorForeground', "The icon color for extension sponsor."), false);
export const extensionPrivateBadgeBackground = registerColor('extensionIcon.privateForeground', { dark: '#ffffff60', light: '#00000060', hcDark: '#ffffff60', hcLight: '#00000060' }, localize('extensionIcon.private', "The icon color for private extensions."));

registerThemingParticipant((theme, collector) => {
	const extensionRatingIcon = theme.getColor(extensionRatingIconColor);
	if (extensionRatingIcon) {
		collector.addRule(`.extension-ratings .codicon-extensions-star-full, .extension-ratings .codicon-extensions-star-half { color: ${extensionRatingIcon}; }`);
		collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(starFullIcon)} { color: ${extensionRatingIcon}; }`);
	}

	const extensionVerifiedPublisherIcon = theme.getColor(extensionVerifiedPublisherIconColor);
	if (extensionVerifiedPublisherIcon) {
		collector.addRule(`${ThemeIcon.asCSSSelector(verifiedPublisherIcon)} { color: ${extensionVerifiedPublisherIcon}; }`);
	}

	collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);
	collector.addRule(`.extension-editor > .header > .details > .subtitle .sponsor ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);

	const privateBadgeBackground = theme.getColor(extensionPrivateBadgeBackground);
	if (privateBadgeBackground) {
		collector.addRule(`.extension-private-badge { color: ${privateBadgeBackground}; }`);
	}
});
