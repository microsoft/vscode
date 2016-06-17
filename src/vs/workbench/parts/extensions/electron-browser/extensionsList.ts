/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export interface ITemplateData {
	extension: IGalleryExtension;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
}

export class Delegate implements IDelegate<IGalleryExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

export class Renderer implements IPagedRenderer<IGalleryExtension, ITemplateData> {

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

	renderElement(extension: IGalleryExtension, index: number, data: ITemplateData): void {
		const publisher = extension ? extension.metadata.publisherDisplayName : extension.manifest.publisher;
		const version = extension.metadata.versions[0];

		data.extension = extension;
		removeClass(data.element, 'loading');
		data.icon.src = version.iconUrl;
		data.name.textContent = extension.manifest.displayName;
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
