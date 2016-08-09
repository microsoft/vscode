/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IExtension } from './extensions';
import { CombinedInstallAction, UpdateAction, EnableAction } from './extensionsActions';
import { Label, RatingsWidget, InstallWidget } from './extensionsWidgets';
import { EventType } from 'vs/base/common/events';

export interface ITemplateData {
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	installCount: HTMLElement;
	ratings: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
	extension: IExtension;
	disposables: IDisposable[];
}

export class Delegate implements IDelegate<IExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

const actionOptions = { icon: true, label: true };

export class Renderer implements IPagedRenderer<IExtension, ITemplateData> {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService private messageService: IMessageService
	) {}

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const element = append(root, $('.extension'));
		const icon = append(element, $<HTMLImageElement>('img.icon'));
		const details = append(element, $('.details'));
		const header = append(details, $('.header'));
		const name = append(header, $('span.name'));
		const version = append(header, $('span.version'));
		const installCount = append(header, $('span.install-count'));
		const ratings = append(header, $('span.ratings'));
		const description = append(details, $('.description.ellipsis'));
		const footer = append(details, $('.footer'));
		const author = append(footer, $('.author.ellipsis'));
		const actionbar = new ActionBar(footer, { animated: false });

		actionbar.addListener2(EventType.RUN, ({ error }) => error && this.messageService.show(Severity.Error, error));

		const versionWidget = this.instantiationService.createInstance(Label, version, e => e.version);
		const installCountWidget = this.instantiationService.createInstance(InstallWidget, installCount, { small: true });
		const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, ratings, { small: true });

		const installAction = this.instantiationService.createInstance(CombinedInstallAction);
		const updateAction = this.instantiationService.createInstance(UpdateAction);
		const restartAction = this.instantiationService.createInstance(EnableAction);

		actionbar.push([restartAction, updateAction, installAction], actionOptions);
		const disposables = [versionWidget, installCountWidget, ratingsWidget, installAction, updateAction, restartAction, actionbar];

		return {
			element, icon, name, installCount, ratings, author, description, disposables,
			set extension(extension: IExtension) {
				versionWidget.extension = extension;
				installCountWidget.extension = extension;
				ratingsWidget.extension = extension;
				installAction.extension = extension;
				updateAction.extension = extension;
				restartAction.extension = extension;
			}
		};
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.element, 'loading');
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
		data.icon.src = extension.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

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
