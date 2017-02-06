/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, $, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { once } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { InstallAction, UpdateAction, BuiltinStatusLabelAction, ManageExtensionAction, ReloadAction } from 'vs/workbench/parts/extensions/browser/extensionsActions';
import { Label, RatingsWidget, InstallWidget } from 'vs/workbench/parts/extensions/browser/extensionsWidgets';
import { EventType } from 'vs/base/common/events';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

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
}

export class Delegate implements IDelegate<IExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

const actionOptions = { icon: true, label: true };

export class Renderer implements IPagedRenderer<IExtension, ITemplateData> {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMessageService private messageService: IMessageService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private extensionService: IExtensionService
	) { }

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
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
					return (<ManageExtensionAction>action).actionItem;
				}
				return null;
			}
		});
		actionbar.addListener2(EventType.RUN, ({ error }) => error && this.messageService.show(Severity.Error, error));

		const versionWidget = this.instantiationService.createInstance(Label, version, e => e.version);
		const installCountWidget = this.instantiationService.createInstance(InstallWidget, installCount, { small: true });
		const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, ratings, { small: true });

		const builtinStatusAction = this.instantiationService.createInstance(BuiltinStatusLabelAction);
		const installAction = this.instantiationService.createInstance(InstallAction);
		const updateAction = this.instantiationService.createInstance(UpdateAction);
		const reloadAction = this.instantiationService.createInstance(ReloadAction);
		const manageAction = this.instantiationService.createInstance(ManageExtensionAction);

		actionbar.push([reloadAction, updateAction, installAction, builtinStatusAction, manageAction], actionOptions);
		const disposables = [versionWidget, installCountWidget, ratingsWidget, builtinStatusAction, updateAction, reloadAction, manageAction, actionbar];

		return {
			root, element, icon, name, installCount, ratings, author, description, disposables,
			extensionDisposables: [],
			set extension(extension: IExtension) {
				versionWidget.extension = extension;
				installCountWidget.extension = extension;
				ratingsWidget.extension = extension;
				builtinStatusAction.extension = extension;
				installAction.extension = extension;
				updateAction.extension = extension;
				reloadAction.extension = extension;
				manageAction.extension = extension;
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

		this.extensionService.getExtensions().then(enabledExtensions => {
			const isExtensionRunning = enabledExtensions.some(e => e.id === extension.identifier);
			const isInstalled = this.extensionsWorkbenchService.local.some(e => e.identifier === extension.identifier);
			toggleClass(data.element, 'disabled', isInstalled && !isExtensionRunning);
		});

		const onError = once(domEvent(data.icon, 'error'));
		onError(() => data.icon.src = extension.iconUrlFallback, null, data.extensionDisposables);
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		data.root.setAttribute('aria-label', extension.displayName);
		data.name.textContent = extension.displayName;
		data.author.textContent = extension.publisherDisplayName;
		data.description.textContent = extension.description;
		data.installCount.style.display = '';
		data.ratings.style.display = '';
		data.extension = extension;
	}

	disposeTemplate(data: ITemplateData): void {
		data.disposables = dispose(data.disposables);
	}
}
