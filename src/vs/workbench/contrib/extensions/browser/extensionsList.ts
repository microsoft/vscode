/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extension';
import { append, $, addDisposableListener } from 'vs/base/browser/dom';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { Event } from 'vs/base/common/event';
import { IExtension, ExtensionContainers, ExtensionState, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { ManageExtensionAction, ReloadAction, ExtensionStatusLabelAction, RemoteInstallAction, ExtensionStatusAction, LocalInstallAction, ActionWithDropDownAction, InstallDropdownAction, InstallingLabelAction, ExtensionActionWithDropdownActionViewItem, ExtensionDropDownAction, WebInstallAction, SwitchToPreReleaseVersionAction, SwitchToReleasedVersionAction, MigrateDeprecatedExtensionAction, SetLanguageAction, ClearLanguageAction, UpdateAction, SkipUpdateAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { RatingsWidget, InstallCountWidget, RecommendationWidget, RemoteBadgeWidget, ExtensionPackCountWidget as ExtensionPackBadgeWidget, SyncIgnoredWidget, ExtensionHoverWidget, ExtensionActivationStatusWidget, PreReleaseBookmarkWidget, extensionVerifiedPublisherIconColor, VerifiedPublisherWidget } from 'vs/workbench/contrib/extensions/browser/extensionsWidgets';
import { IExtensionService, toExtension } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isLanguagePackExtension } from 'vs/platform/extensions/common/extensions';
import { registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { verifiedPublisherIcon as verifiedPublisherThemeIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';

const EXTENSION_LIST_ELEMENT_HEIGHT = 72;

export interface IExtensionsViewState {
	onFocus: Event<IExtension>;
	onBlur: Event<IExtension>;
}

export interface ITemplateData {
	root: HTMLElement;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	publisherDisplayName: HTMLElement;
	description: HTMLElement;
	installCount: HTMLElement;
	ratings: HTMLElement;
	extension: IExtension | null;
	disposables: IDisposable[];
	extensionDisposables: IDisposable[];
	actionbar: ActionBar;
}

export class Delegate implements IListVirtualDelegate<IExtension> {
	getHeight() { return EXTENSION_LIST_ELEMENT_HEIGHT; }
	getTemplateId() { return 'extension'; }
}

export type ExtensionListRendererOptions = {
	hoverOptions: {
		position: () => HoverPosition;
	};
};

export class Renderer implements IPagedRenderer<IExtension, ITemplateData> {

	constructor(
		private extensionViewState: IExtensionsViewState,
		private readonly options: ExtensionListRendererOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) { }

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const recommendationWidget = this.instantiationService.createInstance(RecommendationWidget, append(root, $('.extension-bookmark-container')));
		const preReleaseWidget = this.instantiationService.createInstance(PreReleaseBookmarkWidget, append(root, $('.extension-bookmark-container')));
		const element = append(root, $('.extension-list-item'));
		const iconContainer = append(element, $('.icon-container'));
		const icon = append(iconContainer, $<HTMLImageElement>('img.icon', { alt: '' }));
		const iconRemoteBadgeWidget = this.instantiationService.createInstance(RemoteBadgeWidget, iconContainer, false);
		const extensionPackBadgeWidget = this.instantiationService.createInstance(ExtensionPackBadgeWidget, iconContainer);
		const details = append(element, $('.details'));
		const headerContainer = append(details, $('.header-container'));
		const header = append(headerContainer, $('.header'));
		const name = append(header, $('span.name'));
		const installCount = append(header, $('span.install-count'));
		const ratings = append(header, $('span.ratings'));
		const syncIgnore = append(header, $('span.sync-ignored'));
		const activationStatus = append(header, $('span.activation-status'));
		const headerRemoteBadgeWidget = this.instantiationService.createInstance(RemoteBadgeWidget, header, false);
		const description = append(details, $('.description.ellipsis'));
		const footer = append(details, $('.footer'));
		const publisher = append(footer, $('.author.ellipsis'));
		const verifiedPublisherWidget = this.instantiationService.createInstance(VerifiedPublisherWidget, append(publisher, $(`.verified-publisher`)), true);
		const publisherDisplayName = append(publisher, $('.publisher-name.ellipsis'));
		const actionbar = new ActionBar(footer, {
			animated: false,
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof ActionWithDropDownAction) {
					return new ExtensionActionWithDropdownActionViewItem(action, { icon: true, label: true, menuActionsOrProvider: { getActions: () => action.menuActions }, menuActionClassNames: (action.class || '').split(' ') }, this.contextMenuService);
				}
				if (action instanceof ExtensionDropDownAction) {
					return action.createActionViewItem();
				}
				return undefined;
			},
			focusOnlyEnabledItems: true
		});
		actionbar.setFocusable(false);
		actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));

		const extensionStatusIconAction = this.instantiationService.createInstance(ExtensionStatusAction);
		const actions = [
			this.instantiationService.createInstance(ExtensionStatusLabelAction),
			this.instantiationService.createInstance(MigrateDeprecatedExtensionAction, true),
			this.instantiationService.createInstance(ReloadAction),
			this.instantiationService.createInstance(ActionWithDropDownAction, 'extensions.updateActions', '',
				[[this.instantiationService.createInstance(UpdateAction, false)], [this.instantiationService.createInstance(SkipUpdateAction)]]),
			this.instantiationService.createInstance(InstallDropdownAction),
			this.instantiationService.createInstance(InstallingLabelAction),
			this.instantiationService.createInstance(SetLanguageAction),
			this.instantiationService.createInstance(ClearLanguageAction),
			this.instantiationService.createInstance(RemoteInstallAction, false),
			this.instantiationService.createInstance(LocalInstallAction),
			this.instantiationService.createInstance(WebInstallAction),
			extensionStatusIconAction,
			this.instantiationService.createInstance(SwitchToReleasedVersionAction, true),
			this.instantiationService.createInstance(SwitchToPreReleaseVersionAction, true),
			this.instantiationService.createInstance(ManageExtensionAction)
		];
		const extensionHoverWidget = this.instantiationService.createInstance(ExtensionHoverWidget, { target: root, position: this.options.hoverOptions.position }, extensionStatusIconAction);

		const widgets = [
			recommendationWidget,
			preReleaseWidget,
			iconRemoteBadgeWidget,
			extensionPackBadgeWidget,
			headerRemoteBadgeWidget,
			verifiedPublisherWidget,
			extensionHoverWidget,
			this.instantiationService.createInstance(SyncIgnoredWidget, syncIgnore),
			this.instantiationService.createInstance(ExtensionActivationStatusWidget, activationStatus, true),
			this.instantiationService.createInstance(InstallCountWidget, installCount, true),
			this.instantiationService.createInstance(RatingsWidget, ratings, true),
		];
		const extensionContainers: ExtensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets]);

		actionbar.push(actions, { icon: true, label: true });
		const disposable = combinedDisposable(...actions, ...widgets, actionbar, extensionContainers);

		return {
			root, element, icon, name, installCount, ratings, description, publisherDisplayName, disposables: [disposable], actionbar,
			extensionDisposables: [],
			set extension(extension: IExtension) {
				extensionContainers.extension = extension;
			}
		};
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		data.element.classList.add('loading');

		data.root.removeAttribute('aria-label');
		data.root.removeAttribute('data-extension-id');
		data.extensionDisposables = dispose(data.extensionDisposables);
		data.icon.src = '';
		data.name.textContent = '';
		data.description.textContent = '';
		data.publisherDisplayName.textContent = '';
		data.installCount.style.display = 'none';
		data.ratings.style.display = 'none';
		data.extension = null;
	}

	renderElement(extension: IExtension, index: number, data: ITemplateData): void {
		data.element.classList.remove('loading');
		data.root.setAttribute('data-extension-id', extension.identifier.id);

		if (extension.state !== ExtensionState.Uninstalled && !extension.server) {
			// Get the extension if it is installed and has no server information
			extension = this.extensionsWorkbenchService.local.filter(e => e.server === extension.server && areSameExtensions(e.identifier, extension.identifier))[0] || extension;
		}

		data.extensionDisposables = dispose(data.extensionDisposables);

		const computeEnablement = async () => {
			if (extension.state === ExtensionState.Uninstalled) {
				if (!!extension.deprecationInfo) {
					return true;
				}
				if (this.extensionsWorkbenchService.canSetLanguage(extension)) {
					return false;
				}
				return !(await this.extensionsWorkbenchService.canInstall(extension));
			} else if (extension.local && !isLanguagePackExtension(extension.local.manifest)) {
				const runningExtension = this.extensionService.extensions.filter(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, extension.identifier))[0];
				return !(runningExtension && extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension)));
			}
			return false;
		};
		const updateEnablement = async () => {
			const disabled = await computeEnablement();
			const deprecated = !!extension.deprecationInfo;
			data.element.classList.toggle('deprecated', deprecated);
			data.root.classList.toggle('disabled', disabled);
		};
		updateEnablement();
		this.extensionService.onDidChangeExtensions(() => updateEnablement(), this, data.extensionDisposables);

		data.extensionDisposables.push(addDisposableListener(data.icon, 'error', () => data.icon.src = extension.iconUrlFallback, { once: true }));
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		data.name.textContent = extension.displayName;
		data.description.textContent = extension.description;

		const updatePublisher = () => {
			data.publisherDisplayName.textContent = extension.publisherDisplayName;
		};
		updatePublisher();
		Event.filter(this.extensionsWorkbenchService.onChange, e => !!e && areSameExtensions(e.identifier, extension.identifier))(() => updatePublisher(), this, data.extensionDisposables);

		data.installCount.style.display = '';
		data.ratings.style.display = '';
		data.extension = extension;

		if (extension.gallery && extension.gallery.properties && extension.gallery.properties.localizedLanguages && extension.gallery.properties.localizedLanguages.length) {
			data.description.textContent = extension.gallery.properties.localizedLanguages.map(name => name[0].toLocaleUpperCase() + name.slice(1)).join(', ');
		}

		this.extensionViewState.onFocus(e => {
			if (areSameExtensions(extension.identifier, e.identifier)) {
				data.actionbar.setFocusable(true);
			}
		}, this, data.extensionDisposables);

		this.extensionViewState.onBlur(e => {
			if (areSameExtensions(extension.identifier, e.identifier)) {
				data.actionbar.setFocusable(false);
			}
		}, this, data.extensionDisposables);
	}

	disposeElement(extension: IExtension, index: number, data: ITemplateData): void {
		data.extensionDisposables = dispose(data.extensionDisposables);
	}

	disposeTemplate(data: ITemplateData): void {
		data.extensionDisposables = dispose(data.extensionDisposables);
		data.disposables = dispose(data.disposables);
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const verifiedPublisherIconColor = theme.getColor(extensionVerifiedPublisherIconColor);
	if (verifiedPublisherIconColor) {
		const disabledVerifiedPublisherIconColor = verifiedPublisherIconColor.transparent(.5).makeOpaque(WORKBENCH_BACKGROUND(theme));
		collector.addRule(`.extensions-list .monaco-list .monaco-list-row.disabled .author .verified-publisher ${ThemeIcon.asCSSSelector(verifiedPublisherThemeIcon)} { color: ${disabledVerifiedPublisherIconColor}; }`);
	}
});
