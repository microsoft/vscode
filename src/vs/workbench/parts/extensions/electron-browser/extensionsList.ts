/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { append, $, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { Event } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IExtension, IExtensionsWorkbenchService, ExtensionContainers } from 'vs/workbench/parts/extensions/common/extensions';
import { InstallAction, UpdateAction, ManageExtensionAction, ReloadAction, extensionButtonProminentBackground, extensionButtonProminentForeground, MaliciousStatusLabelAction, ExtensionActionItem } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { Label, RatingsWidget, InstallCountWidget } from 'vs/workbench/parts/extensions/browser/extensionsWidgets';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionTipsService, IExtensionManagementServerService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationService } from 'vs/platform/notification/common/notification';

export interface IExtensionsViewState {
	onFocus: Event<IExtension>;
	onBlur: Event<IExtension>;
}

export interface ITemplateData {
	root: HTMLElement;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	installCount: HTMLElement;
	ratings: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
	extension: IExtension;
	disposables: IDisposable[];
	extensionDisposables: IDisposable[];
	actionbar: ActionBar;
}

export class Delegate implements IListVirtualDelegate<IExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

const actionOptions = { icon: true, label: true, tabOnlyOnFocus: true };

export class Renderer implements IPagedRenderer<IExtension, ITemplateData> {

	constructor(
		private extensionViewState: IExtensionsViewState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService
	) { }

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const bookmark = append(root, $('span.bookmark'));
		append(bookmark, $('span.octicon.octicon-star'));
		const applyBookmarkStyle = (theme) => {
			const bgColor = theme.getColor(extensionButtonProminentBackground);
			const fgColor = theme.getColor(extensionButtonProminentForeground);
			bookmark.style.borderTopColor = bgColor ? bgColor.toString() : 'transparent';
			bookmark.style.color = fgColor ? fgColor.toString() : 'white';
		};
		applyBookmarkStyle(this.themeService.getTheme());
		const bookmarkStyler = this.themeService.onThemeChange(applyBookmarkStyle.bind(this));

		const element = append(root, $('.extension'));
		const icon = append(element, $<HTMLImageElement>('img.icon'));
		const details = append(element, $('.details'));
		const headerContainer = append(details, $('.header-container'));
		const header = append(headerContainer, $('.header'));
		const name = append(header, $('span.name'));
		const version = append(header, $('span.version'));
		const installCount = append(header, $('span.install-count'));
		const ratings = append(header, $('span.ratings'));
		const description = append(details, $('.description.ellipsis'));
		const footer = append(details, $('.footer'));
		const author = append(footer, $('.author.ellipsis'));
		const actionbar = new ActionBar(footer, {
			animated: false,
			actionItemProvider: (action: Action) => {
				if (action.id === ManageExtensionAction.ID) {
					return (<ManageExtensionAction>action).createActionItem();
				}
				return new ExtensionActionItem(null, action, actionOptions);
			}
		});
		actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));

		const widgets = [
			this.instantiationService.createInstance(Label, version, (e: IExtension) => e.version),
			this.instantiationService.createInstance(InstallCountWidget, installCount, true),
			this.instantiationService.createInstance(RatingsWidget, ratings, true)
		];
		const actions = [
			this.instantiationService.createInstance(UpdateAction),
			this.instantiationService.createInstance(ReloadAction),
			this.instantiationService.createInstance(InstallAction),
			this.instantiationService.createInstance(MaliciousStatusLabelAction, false),
			this.instantiationService.createInstance(ManageExtensionAction)
		];
		const extensionContainers: ExtensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets]);

		actionbar.push(actions, actionOptions);
		const disposables = [...actions, ...widgets, actionbar, bookmarkStyler, extensionContainers];

		return {
			root, element, icon, name, installCount, ratings, author, description, disposables, actionbar,
			extensionDisposables: [],
			set extension(extension: IExtension) {
				extensionContainers.extension = extension;
			}
		};
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.element, 'loading');

		data.root.removeAttribute('aria-label');
		data.extensionDisposables = dispose(data.extensionDisposables);
		data.icon.src = '';
		data.name.textContent = '';
		data.author.textContent = '';
		data.description.textContent = '';
		data.installCount.style.display = 'none';
		data.ratings.style.display = 'none';
		data.extension = null;
	}

	renderElement(extension: IExtension, index: number, data: ITemplateData): void {
		removeClass(data.element, 'loading');

		data.extensionDisposables = dispose(data.extensionDisposables);
		const installed = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0];

		this.extensionService.getExtensions().then(runningExtensions => {
			if (installed && installed.local) {
				const installedExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(installed.local.location);
				const isSameExtensionRunning = runningExtensions.some(e => {
					if (!areSameExtensions({ id: e.identifier.value }, extension.identifier)) {
						return false;
					}
					const runningExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(e.extensionLocation);
					if (!installedExtensionServer || !runningExtensionServer) {
						return false;
					}
					return installedExtensionServer.authority === runningExtensionServer.authority;
				});
				toggleClass(data.root, 'disabled', !isSameExtensionRunning);
			} else {
				removeClass(data.root, 'disabled');
			}
		});

		const onError = Event.once(domEvent(data.icon, 'error'));
		onError(() => data.icon.src = extension.iconUrlFallback, null, data.extensionDisposables);
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		this.updateRecommendationStatus(extension, data);
		data.extensionDisposables.push(this.extensionTipsService.onRecommendationChange(change => {
			if (areSameExtensions({ id: change.extensionId }, extension.identifier)) {
				this.updateRecommendationStatus(extension, data);
			}
		}));

		data.name.textContent = extension.displayName;
		data.author.textContent = extension.publisherDisplayName;
		data.description.textContent = extension.description;
		data.installCount.style.display = '';
		data.ratings.style.display = '';
		data.extension = extension;

		if (extension.gallery && extension.gallery.properties && extension.gallery.properties.localizedLanguages && extension.gallery.properties.localizedLanguages.length) {
			data.description.textContent = extension.gallery.properties.localizedLanguages.map(name => name[0].toLocaleUpperCase() + name.slice(1)).join(', ');
		}

		this.extensionViewState.onFocus(e => {
			if (areSameExtensions(extension.identifier, e.identifier)) {
				data.actionbar.items.forEach(item => (<ExtensionActionItem>item).setFocus(true));
			}
		}, this, data.extensionDisposables);

		this.extensionViewState.onBlur(e => {
			if (areSameExtensions(extension.identifier, e.identifier)) {
				data.actionbar.items.forEach(item => (<ExtensionActionItem>item).setFocus(false));
			}
		}, this, data.extensionDisposables);
	}

	private updateRecommendationStatus(extension: IExtension, data: ITemplateData) {
		const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
		let ariaLabel = extension.displayName + '. ';

		if (!extRecommendations[extension.identifier.id.toLowerCase()]) {
			removeClass(data.root, 'recommended');
			data.root.title = '';
		} else {
			addClass(data.root, 'recommended');
			ariaLabel += extRecommendations[extension.identifier.id.toLowerCase()].reasonText + ' ';
			data.root.title = extRecommendations[extension.identifier.id.toLowerCase()].reasonText;
		}

		ariaLabel += localize('viewExtensionDetailsAria', "Press enter for extension details.");
		data.root.setAttribute('aria-label', ariaLabel);

	}

	disposeTemplate(data: ITemplateData): void {
		data.disposables = dispose(data.disposables);
	}
}
