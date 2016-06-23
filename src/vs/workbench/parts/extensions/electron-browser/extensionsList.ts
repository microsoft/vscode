/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IExtension } from './extensions';
import { CombinedInstallAction, UpdateAction } from './extensionsActions';
import { Label } from './extensionsWidgets';

export interface ITemplateData {
	extension: IExtension;
	element: HTMLElement;
	icon: HTMLElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
	actionbar: ActionBar;
	disposables: IDisposable[];
}

export class Delegate implements IDelegate<IExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

const actionOptions = { icon: true, label: true };

export class Renderer implements IPagedRenderer<IExtension, ITemplateData> {

	private _templates: ITemplateData[];
	get templates(): ITemplateData[] { return this._templates; }

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		this._templates = [];
	}

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const element = append(root, $('.extension'));
		const icon = append(element, $('.icon'));
		const details = append(element, $('.details'));
		const header = append(details, $('.header'));
		const name = append(header, $('span.name.ellipsis'));
		const version = append(header, $('span.version.ellipsis'));
		const author = append(header, $('span.author.ellipsis'));
		const description = append(details, $('.description.ellipsis'));
		const footer = append(details, $('.footer'));
		const actionbar = new ActionBar(footer, { animated: false });
		const disposables = [];

		const result = { extension: null, element, icon, name, version, author, description, actionbar, disposables };
		this._templates.push(result);
		return result;
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		data.disposables = dispose(data.disposables);

		addClass(data.element, 'loading');
		data.extension = null;
		data.icon.style.backgroundImage = '';
		data.name.textContent = '';
		data.version.textContent = '';
		data.author.textContent = '';
		data.description.textContent = '';
		data.actionbar.clear();
	}

	renderElement(extension: IExtension, index: number, data: ITemplateData): void {
		data.disposables = dispose(data.disposables);

		removeClass(data.element, 'loading');
		data.extension = extension;
		data.icon.style.backgroundImage = `url("${ extension.iconUrl }")`;
		data.name.textContent = extension.displayName;
		data.author.textContent = extension.publisherDisplayName;
		data.description.textContent = extension.description;

		const version = this.instantiationService.createInstance(Label, data.version, extension, e => e.version);
		const installAction = this.instantiationService.createInstance(CombinedInstallAction, extension);
		const updateAction = this.instantiationService.createInstance(UpdateAction, extension);
		data.actionbar.clear();
		data.actionbar.push([updateAction, installAction], actionOptions);

		data.disposables.push(version, installAction, updateAction);
	}

	disposeTemplate(data: ITemplateData): void {
		const index = this._templates.indexOf(data);

		if (index > -1) {
			this._templates.splice(index, 1);
		}
	}
}
