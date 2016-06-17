/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export interface ITemplateData {
	extension: IExtension | IGalleryExtension;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
}

export class Delegate implements IDelegate<IExtension | IGalleryExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

export class Renderer implements IPagedRenderer<IExtension | IGalleryExtension, ITemplateData> {

	private _templates: ITemplateData[];
	get templates(): ITemplateData[] { return this._templates; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this._templates = [];
	}

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const element = append(root, $('.extension'));
		const icon = append(element, $<HTMLImageElement>('img.icon'));
		const details = append(element, $('.details'));
		const header = append(details, $('.header'));
		const name = append(header, $('span.name.ellipsis'));
		const version = append(header, $('span.version.ellipsis'));
		const author = append(header, $('span.author.ellipsis'));
		const description = append(details, $('.description.ellipsis'));
		const result = { extension: null, element, icon, name, version, author, description };

		this._templates.push(result);
		return result;
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.element, 'loading');
		data.extension = null;
		data.icon.src = '';
		data.name.textContent = '';
		data.version.textContent = '';
		data.author.textContent = '';
		data.description.textContent = '';
	}

	renderElement(extension: IExtension | IGalleryExtension, index: number, data: ITemplateData): void {
		const local = extension as IExtension;
		let iconUrl: string;
		let publisher: string = extension.manifest.publisher;

		if (extension.path) {
			if (local.manifest.icon) {
				iconUrl = `file://${ local.path }/${ local.manifest.icon }`;
			}
		}

		if (extension.metadata) {
			const version = extension.metadata.versions[0];
			publisher = extension.metadata.publisherDisplayName || extension.manifest.publisher || publisher;
			iconUrl = iconUrl || version.iconUrl;
		}

		data.extension = extension;
		removeClass(data.element, 'loading');
		data.icon.src = iconUrl || require.toUrl('./media/defaultIcon.png');
		data.name.textContent = extension.manifest.displayName || extension.manifest.name;
		data.version.textContent = ` ${ extension.manifest.version }`;
		data.author.textContent = ` ${ publisher }`;
		data.description.textContent = extension.manifest.description;
	}

	disposeTemplate(data: ITemplateData): void {
		const index = this._templates.indexOf(data);

		if (index > -1) {
			this._templates.splice(index, 1);
		}
	}
}
